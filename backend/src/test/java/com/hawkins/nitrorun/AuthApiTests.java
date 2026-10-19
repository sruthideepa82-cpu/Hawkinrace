package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Sign-up, sign-in, sign-out and the guarantees around them.
 *
 * <p>This is the suite that pins Phase 7's central claim: until it existed,
 * every endpoint was open to anyone.
 */
class AuthApiTests extends ApiTestSupport {

    @Test
    @DisplayName("register creates an account and returns a usable token")
    void registerReturnsAToken() throws Exception {
        JsonNode created = bodyOf(mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Newbie\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isCreated()));

        assertEquals("Bearer", created.get("tokenType").asText());
        assertTrue(created.get("token").asText().length() >= 40, "token should be long");
        assertNotEquals("", created.get("expiresAt").asText());

        // The token actually works.
        String id = created.get("player").get("id").asText();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + created.get("token").asText()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id));
    }

    @Test
    @DisplayName("the password is hashed, never stored in the clear")
    void passwordIsHashedAtRest() throws Exception {
        Account account = account("Hashed", null);

        String stored = jdbc.queryForObject(
                "SELECT password_hash FROM players WHERE id = ?", String.class, account.id());

        assertTrue(stored != null && !stored.isBlank(), "a hash should be stored");
        assertTrue(stored.startsWith("$2"), "expected a BCrypt hash, got: " + stored);
        assertFalse(stored.contains(PASSWORD), "the plaintext must not appear in the column");
        assertTrue(stored.length() >= 59, "a BCrypt hash is at least 59 characters");
    }

    @Test
    @DisplayName("two players with the same password get different hashes")
    void hashesAreSalted() throws Exception {
        Account a = account("SaltA", null);
        Account b = account("SaltB", null);
        String hashA = jdbc.queryForObject(
                "SELECT password_hash FROM players WHERE id = ?", String.class, a.id());
        String hashB = jdbc.queryForObject(
                "SELECT password_hash FROM players WHERE id = ?", String.class, b.id());

        assertNotEquals(hashA, hashB, "BCrypt must salt per password");
    }

    @Test
    @DisplayName("the token is stored hashed, not in the clear")
    void tokenIsHashedAtRest() throws Exception {
        Account account = account("Tokened", null);
        String token = account.token();

        Integer plaintextRows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM auth_tokens WHERE token_hash = ?", Integer.class, token);
        assertEquals(0, plaintextRows, "the raw token must not be usable as the stored hash");

        assertEquals(1, rowCount("auth_tokens"), "a session row should exist");
    }

    @Test
    @DisplayName("sign in with the right password works")
    void loginSucceeds() throws Exception {
        account("LoginOk", null);
        JsonNode response = bodyOf(mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"LoginOk\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk()));
        assertEquals("Bearer", response.get("tokenType").asText());
    }

    @Test
    @DisplayName("a wrong password is 401")
    void wrongPasswordIs401() throws Exception {
        account("LoginBad", null);
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"LoginBad\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("an unknown display name gives the same answer as a wrong password")
    void unknownUserIsIndistinguishable() throws Exception {
        account("RealOne", null);

        int unknownStatus = statusOf(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"NoSuchPerson\",\"password\":\"whatever\"}"));
        int wrongPasswordStatus = statusOf(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"RealOne\",\"password\":\"whatever\"}"));

        assertEquals(wrongPasswordStatus, unknownStatus,
                "differing responses would let an attacker enumerate accounts");
        assertEquals(401, unknownStatus);
    }

    @Test
    @DisplayName("sign out revokes the token immediately")
    void logoutRevokesTheToken() throws Exception {
        Account account = account("Logouter", null);
        String token = account.token();

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        // The same token must stop working at once, not when it expires.
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertEquals(0, rowCount("auth_tokens"), "the session row should be gone");
    }

    @Test
    @DisplayName("a short password is refused at sign-up")
    void weakPasswordIsRefused() throws Exception {
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Weakling\",\"password\":\"abc\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.password").exists());
    }

    @Test
    @DisplayName("a missing display name is refused")
    void missingDisplayNameIsRefused() throws Exception {
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.displayName").exists());
    }

    @Test
    @DisplayName("player data requires a token")
    void playerDataRequiresAToken() throws Exception {
        Account account = account("Private", null);
        createRace(account.id(), 140_000, 1);

        mvc.perform(get("/api/players/" + account.id())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/races")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/players/" + account.id() + "/races")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("the catalogue and leaderboard stay public")
    void referenceDataStaysPublic() throws Exception {
        // A signed-out visitor should still see cars, tracks and the times. The
        // leaderboard is the game's public face.
        mvc.perform(get("/api/cars")).andExpect(status().isOk());
        mvc.perform(get("/api/tracks")).andExpect(status().isOk());
        mvc.perform(get("/api/health")).andExpect(status().isOk());
        mvc.perform(get("/api/leaderboard")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unmapped path is denied rather than opened")
    void unmappedPathsAreDenied() throws Exception {
        // `anyRequest().denyAll()` means a new endpoint is unreachable until
        // someone decides its audience. Failing open would be the wrong default.
        //
        // The answer is 401 rather than 404 for an anonymous caller: the security
        // rules run before the dispatcher, so the request never reaches a handler.
        // Either way nothing is served.
        int anonymous = mvc.perform(get("/api/")).andReturn().getResponse().getStatus();
        assertTrue(anonymous == 401 || anonymous == 404,
                "an unmapped anonymous path must not be served, got " + anonymous);

        // A path that exists but was never granted to anyone.
        Account account = account("Nosy", null);
        int status = mvc.perform(authed(get("/api/auth/nonexistent"), account.id()))
                .andReturn().getResponse().getStatus();
        assertTrue(status == 403 || status == 404,
                "an unmapped authenticated path must not be served, got " + status);
    }

    @Test
    @DisplayName("error bodies leak nothing sensitive")
    void errorsDoNotLeak() throws Exception {
        String body = mvc.perform(get("/api/players/plr_nope"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        for (String forbidden : new String[] { "password", "$2a$", "jdbc:", "com.hawkins", "\tat " }) {
            assertFalse(body.contains(forbidden), "response should not contain '" + forbidden + "': " + body);
        }
    }

    private int statusOf(org.springframework.test.web.servlet.RequestBuilder request) throws Exception {
        try {
            return mvc.perform(request).andReturn().getResponse().getStatus();
        } catch (Exception ex) {
            throw ex;
        }
    }
}