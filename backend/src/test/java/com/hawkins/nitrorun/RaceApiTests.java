package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Race submission, history, idempotency and the anti-nonsense checks.
 *
 * <p>The body carries no {@code playerId}. Every test therefore proves the same
 * thing from a different angle: the race is attributed to whoever signed in, and
 * there is no way to say otherwise.
 */
class RaceApiTests extends ApiTestSupport {

    private static final String VALID = """
            {"carId":"apex-vulcan","trackId":"hawkins-streets",
             "elapsedTimeMs":134883,"bestLapTimeMs":44321,"position":1,"lapsCompleted":3}
            """;

    @Test
    @DisplayName("POST /api/races stores a completed race")
    void createRace() throws Exception {
        Account account = account("Racer", null);
        JsonNode saved = bodyOf(mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isCreated()));

        assertTrue(saved.get("id").asText().startsWith("race_"));
        assertEquals(account.id(), saved.get("race").get("playerId").asText());
        assertEquals(134883, saved.get("race").get("elapsedTimeMs").asLong());
    }

    @Test
    @DisplayName("the race is attributed to the session, not to a body field")
    void playerComesFromTheSession() throws Exception {
        Account mine = account("Mine3", null);
        Account theirs = account("Theirs3", null);

        // A body that tries to name someone else is simply ignored: the field is
        // not in the DTO, so there is nothing for it to set.
        JsonNode saved = bodyOf(mvc.perform(authed(post("/api/races"), theirs.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID.replace("{", "{\"playerId\":\"" + mine.id() + "\",")))
                .andExpect(status().isCreated()));

        assertEquals(theirs.id(), saved.get("race").get("playerId").asText());
        assertNotEquals(mine.id(), saved.get("race").get("playerId").asText());
    }

    @Test
    @DisplayName("an unauthenticated submission is 401")
    void anonymousSubmissionIsRejected() throws Exception {
        mvc.perform(post("/api/races").contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    @DisplayName("a bogus token is 401")
    void bogusTokenIsRejected() throws Exception {
        mvc.perform(post("/api/races")
                        .header("Authorization", "Bearer not-a-real-token")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/races returns only the caller's races")
    void listIsScopedToTheCaller() throws Exception {
        Account mine = account("Mine4", null);
        Account theirs = account("Theirs4", null);
        createRace(mine.id(), 140_000, 1);
        createRace(theirs.id(), 150_000, 2);

        JsonNode body = bodyOf(mvc.perform(authed(get("/api/races"), mine.id()))
                .andExpect(status().isOk()));
        assertEquals(1, body.size(), "should see only their own race");
        assertEquals(mine.id(), body.get(0).get("playerId").asText());
    }

    @Test
    @DisplayName("another player's race is 404 on direct read")
    void cannotReadAnotherPlayersRace() throws Exception {
        Account mine = account("Mine5", null);
        Account theirs = account("Theirs5", null);
        String raceId = createRace(theirs.id(), 150_000, 1);

        mvc.perform(authed(get("/api/races/" + raceId), mine.id()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("race history is newest first")
    void raceHistory() throws Exception {
        Account account = account("Historian", null);
        createRace(account.id(), 160_000, 3);
        Thread.sleep(15); // completed_at has millisecond resolution
        createRace(account.id(), 140_000, 1);

        JsonNode history = bodyOf(mvc.perform(authed(
                        get("/api/players/" + account.id() + "/races"), account.id()))
                .andExpect(status().isOk()));

        assertEquals(2, history.size());
        assertEquals(140_000, history.get(0).get("elapsedTimeMs").asLong());
        assertEquals(160_000, history.get(1).get("elapsedTimeMs").asLong());
    }

    @Test
    @DisplayName("another player's history is 404, not an empty list")
    void historyOfAnotherPlayerIs404() throws Exception {
        Account mine = account("Mine6", null);
        Account theirs = account("Theirs6", null);
        createRace(theirs.id(), 140_000, 1);

        mvc.perform(authed(get("/api/players/" + theirs.id() + "/races"), mine.id()))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------
    // Idempotency
    // ------------------------------------------------------------------

    @Test
    @DisplayName("the same Idempotency-Key twice stores one race")
    void repeatedKeyStoresOnce() throws Exception {
        Account account = account("Retrier", null);
        String key = "11111111-2222-3333-4444-555555555555";

        mvc.perform(authed(post("/api/races"), account.id())
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isCreated());

        // A replay is 200, not 201: nothing was created the second time.
        mvc.perform(authed(post("/api/races"), account.id())
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isOk());

        assertEquals(1, rowCount("races"), "the replay must not add a second row");
    }

    @Test
    @DisplayName("a different key is a different race")
    void differentKeysAreDifferentRaces() throws Exception {
        Account account = account("Twice", null);
        createRace(account.id(), 140_000, 1);
        createRace(account.id(), 150_000, 2);
        assertEquals(2, rowCount("races"));
    }

    @Test
    @DisplayName("an idempotency key is globally unique, so another player cannot reuse one")
    void keysAreGloballyUnique() throws Exception {
        Account mine = account("Mine7", null);
        Account theirs = account("Theirs7", null);
        String key = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

        mvc.perform(authed(post("/api/races"), theirs.id())
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isCreated());

        // A different player sending the same key is a conflict, not a replay.
        // Keys are client-generated UUIDs, so this is a collision, not an attack
        // worth designing for -- and refusing is the safe reading of it.
        mvc.perform(authed(post("/api/races"), mine.id())
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isConflict());

        assertEquals(1, rowCount("races"), "the second attempt must not add a row");
    }

    @Test
    @DisplayName("a malformed Idempotency-Key is 400")
    void malformedKeyIsRejected() throws Exception {
        Account account = account("BadKey", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .header("Idempotency-Key", "not a uuid!")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    @Test
    @DisplayName("a lap slower than the whole race is rejected")
    void lapLongerThanRaceIsRejected() throws Exception {
        Account account = account("Inconsistent", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID.replace("134883", "100000").replace("44321", "150000")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("cannot be greater")));
    }

    @Test
    @DisplayName("more laps than the track has is rejected")
    void tooManyLapsIsRejected() throws Exception {
        Account account = account("Lapper", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID.replace("134883", "400000").replace("\"lapsCompleted\":3", "\"lapsCompleted\":9")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("exceeds")));
    }

    @Test
    @DisplayName("a best lap reported with zero laps is rejected")
    void bestLapWithoutLapsIsRejected() throws Exception {
        Account account = account("NoLaps", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":40000,"bestLapTimeMs":39000,
                                 "position":1,"lapsCompleted":0}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a physically impossible lap time is rejected")
    void implausibleTimeIsRejected() throws Exception {
        Account account = account("Teleporting", null);
        // 0.4 seconds for three laps is what a client dividing by the wrong
        // constant actually produces, so this is a real failure mode and not a
        // hypothetical one.
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":400,"bestLapTimeMs":133,"position":1,"lapsCompleted":3}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("not plausible")));
    }

    @Test
    @DisplayName("an unknown car is 404")
    void unknownCarIs404() throws Exception {
        Account account = account("BadCar2", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID.replace("apex-vulcan", "delorean")))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a non-positive elapsed time is 400")
    void nonPositiveTimeIs400() throws Exception {
        Account account = account("ZeroTime", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID.replace("134883", "0")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.elapsedTimeMs").exists());
    }

    @Test
    @DisplayName("a position below 1 is 400")
    void invalidPositionIs400() throws Exception {
        Account account = account("BadPos", null);
        mvc.perform(authed(post("/api/races"), account.id())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID.replace("\"position\":1", "\"position\":0")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.position").exists());
    }

    @Test
    @DisplayName("a stored race really is a row in MySQL")
    void recordsReachTheDatabase() throws Exception {
        Account account = account("Persisted2", null);
        String raceId = createRace(account.id(), 150_000, 1);

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT player_id, car_id, track_id, finishing_position, "
                        + "laps_completed, total_laps, elapsed_time_ms "
                        + "FROM races WHERE id = ?", raceId);

        assertEquals(account.id(), row.get("player_id"));
        assertEquals("apex-vulcan", row.get("car_id"));
        assertEquals(3, ((Number) row.get("total_laps")).intValue());
        assertEquals(150_000L, ((Number) row.get("elapsed_time_ms")).longValue());
    }
}