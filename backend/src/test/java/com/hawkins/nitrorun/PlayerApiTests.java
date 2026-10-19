package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Reading and updating the signed-in player's own profile.
 *
 * <p>Every test here runs as a real, registered, signed-in player. There is no
 * {@code POST /api/players} any more: creating an account without a password was
 * the thing Phase 7 removed, and {@code PlayerApiTests} is where that change is
 * pinned.
 */
class PlayerApiTests extends ApiTestSupport {

    @Test
    @DisplayName("a registered account comes back from GET /api/auth/me")
    void meReturnsTheAccount() throws Exception {
        Account account = account("RacerOne", null);
        mvc.perform(authed(get("/api/auth/me"), account.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(account.id()))
                .andExpect(jsonPath("$.displayName").value("RacerOne"));
    }

    @Test
    @DisplayName("a password is never returned in any payload")
    void passwordIsNeverExposed() throws Exception {
        Account account = account("Secretive", null);
        String me = mvc.perform(authed(get("/api/auth/me"), account.id()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String full = mvc.perform(get("/api/players/" + account.id()).header(
                        "Authorization", "Bearer " + account.token()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        for (String body : new String[] { me, full }) {
            assertTrue(!body.toLowerCase().contains("password"), body);
            assertTrue(!body.contains("$2a$"), "no BCrypt hash should appear in a response");
        }
    }

    @Test
    @DisplayName("GET /api/players/{id} reads the caller's own profile")
    void readOwnProfile() throws Exception {
        Account account = account("Reader", null);
        mvc.perform(authed(get("/api/players/" + account.id()), account.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(account.id()))
                .andExpect(jsonPath("$.displayName").value("Reader"));
    }

    @Test
    @DisplayName("another player's profile is 404, not 403")
    void otherPlayerIsIndistinguishableFromMissing() throws Exception {
        Account mine = account("Mine", null);
        Account theirs = account("Theirs", null);

        mvc.perform(authed(get("/api/players/" + theirs.id()), mine.id()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        // Identical to a genuinely absent id, so this endpoint cannot be used to
        // discover which player ids exist.
        mvc.perform(authed(get("/api/players/plr_nosuchperson"), mine.id()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("plr_nosuchperson")));
    }

    @Test
    @DisplayName("PUT updates the caller's own profile")
    void updateOwnProfile() throws Exception {
        Account account = account("Before", null);
        mvc.perform(authed(put("/api/players/" + account.id()), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"After\",\"selectedCarId\":\"venom-verde\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("After"))
                .andExpect(jsonPath("$.selectedCarId").value("venom-verde"));
    }

    @Test
    @DisplayName("PUT cannot be aimed at someone else's profile")
    void cannotUpdateAnotherPlayer() throws Exception {
        Account mine = account("Mine2", null);
        Account theirs = account("Theirs2", null);

        mvc.perform(authed(put("/api/players/" + theirs.id()), mine.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Hijacked\"}"))
                .andExpect(status().isNotFound());

        // And the target really is untouched.
        mvc.perform(authed(get("/api/auth/me"), theirs.id()))
                .andExpect(jsonPath("$.displayName").value("Theirs2"));
    }

    @Test
    @DisplayName("PUT preserves the id and creation time")
    void updatePreservesIdentity() throws Exception {
        Account account = account("Stable", null);
        String createdAt = mvc.perform(authed(get("/api/auth/me"), account.id()))
                .andReturn().getResponse().getContentAsString();

        mvc.perform(authed(put("/api/players/" + account.id()), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"StillStable\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(account.id()));

        String after = mvc.perform(authed(get("/api/auth/me"), account.id()))
                .andReturn().getResponse().getContentAsString();
        assertEquals(json.readTree(createdAt).get("createdAt").asText(),
                json.readTree(after).get("createdAt").asText());
    }

    @Test
    @DisplayName("a display name already in use is 409")
    void duplicateDisplayNameConflicts() throws Exception {
        account("Twin", null);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Twin\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    @DisplayName("the same player keeping their own name is not a conflict")
    void selfRenameIsNotADuplicate() throws Exception {
        Account account = account("Solo", null);
        mvc.perform(authed(put("/api/players/" + account.id()), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Solo\"}"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an invalid display name is 400 with a field error")
    void invalidNameIsBadRequest() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"a\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.displayName").exists());
    }

    @Test
    @DisplayName("a short password is 400")
    void shortPasswordIsRejected() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Shorty\",\"password\":\"abc\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.password").exists());
    }

    @Test
    @DisplayName("an unknown car on a profile is 404")
    void unknownCarIs404() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"BadCar\",\"password\":\"" + PASSWORD
                                + "\",\"selectedCarId\":\"delorean\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the old open POST /api/players no longer exists")
    void openRegistrationIsGone() throws Exception {
        // Before Phase 7 this created an unowned profile with no credentials and
        // anyone could call it. Any of 401/404/405 is a correct refusal; 201 is
        // the failure this test exists to catch.
        int status = statusOf(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/api/players")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"Anonymous\"}"));
        org.junit.jupiter.api.Assertions.assertNotEquals(201, status,
                "registering without a password must not be possible");
    }

    @Test
    @DisplayName("the old open GET /api/players listing is gone")
    void playerDirectoryIsGone() throws Exception {
        int status = statusOf(get("/api/players"));
        org.junit.jupiter.api.Assertions.assertNotEquals(200, status,
                "there must be no open directory of every player");
    }

    /** The HTTP status of a request that is expected to fail. */
    private int statusOf(org.springframework.test.web.servlet.RequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("profile data is stored, not just echoed")
    void profileIsPersisted() throws Exception {
        Account account = account("Persisted", "shadow-gt");
        String stored = jdbc.queryForObject(
                "SELECT selected_car_id FROM players WHERE id = ?", String.class, account.id());
        assertEquals("shadow-gt", stored);
        assertNotNull(account.id());
    }
}