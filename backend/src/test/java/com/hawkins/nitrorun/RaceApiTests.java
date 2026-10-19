package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

/** Storing and reading race records, and the validation around them. */
class RaceApiTests extends ApiTestSupport {

    @Test
    @DisplayName("POST /api/races stores a completed race and returns 201")
    void createRace() throws Exception {
        String playerId = createPlayer("Racer");
        JsonNode saved = bodyOf(mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":134883,"bestLapTimeMs":44321,"position":1,"lapsCompleted":3}
                                """.formatted(playerId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.race.position").value(1)));

        assertTrue(saved.get("id").asText().startsWith("race_"));
        assertEquals(playerId, saved.get("race").get("playerId").asText());
    }

    @Test
    @DisplayName("GET /api/races/{id} reads a stored record back")
    void readRace() throws Exception {
        String playerId = createPlayer("Racer");
        String raceId = createRace(playerId, 150_000, 2);

        mvc.perform(get("/api/races/" + raceId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(raceId))
                .andExpect(jsonPath("$.elapsedTimeMs").value(150_000))
                .andExpect(jsonPath("$.position").value(2));
    }

    @Test
    @DisplayName("GET /api/races lists every stored record")
    void listRaces() throws Exception {
        String playerId = createPlayer("Racer");
        createRace(playerId, 150_000, 1);
        createRace(playerId, 140_000, 2);

        JsonNode all = bodyOf(mvc.perform(get("/api/races")).andExpect(status().isOk()));
        assertEquals(2, all.size());
    }

    @Test
    @DisplayName("GET /api/players/{id}/races returns that player's history, newest first")
    void raceHistory() throws Exception {
        String playerId = createPlayer("Historian");
        createRace(playerId, 160_000, 3);
        // `Instant.now()` resolves in milliseconds on Windows, so two races stored
        // back to back can share a timestamp. Sleeping here makes the ordering
        // assertion unambiguous -- the tie case is covered in the repository.
        Thread.sleep(15);
        createRace(playerId, 140_000, 1);

        JsonNode history = bodyOf(mvc.perform(get("/api/players/" + playerId + "/races"))
                .andExpect(status().isOk()));

        assertEquals(2, history.size());
        // Newest first. The 140s race was stored LAST, so it belongs at index 0
        // even though it is the quicker of the two.
        assertEquals(140_000, history.get(0).get("elapsedTimeMs").asLong());
        assertEquals(160_000, history.get(1).get("elapsedTimeMs").asLong());
    }

    @Test
    @DisplayName("a player with no races gets an empty history, not a 404")
    void emptyHistoryIsNotAnError() throws Exception {
        String playerId = createPlayer("Newcomer");
        mvc.perform(get("/api/players/" + playerId + "/races"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("history for an unknown player is 404, distinct from an empty list")
    void historyOfUnknownPlayerIs404() throws Exception {
        mvc.perform(get("/api/players/plr_ghost/races"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an unknown race id is 404")
    void unknownRaceIs404() throws Exception {
        mvc.perform(get("/api/races/race_nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    @DisplayName("an unknown player on a submitted race is 404")
    void unknownPlayerIs404() throws Exception {
        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"plr_ghost","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":120000,"position":1,"lapsCompleted":3}
                                """))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an unknown car or track is 404")
    void unknownCarOrTrackIs404() throws Exception {
        String playerId = createPlayer("Racer");

        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"delorean","trackId":"hawkins-streets",
                                 "elapsedTimeMs":120000,"position":1,"lapsCompleted":3}
                                """.formatted(playerId)))
                .andExpect(status().isNotFound());

        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"mars",
                                 "elapsedTimeMs":120000,"position":1,"lapsCompleted":3}
                                """.formatted(playerId)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a non-positive elapsed time is 400")
    void nonPositiveTimeIs400() throws Exception {
        String playerId = createPlayer("Racer");
        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":0,"position":1,"lapsCompleted":3}
                                """.formatted(playerId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.elapsedTimeMs").exists());
    }

    @Test
    @DisplayName("position below 1 is 400")
    void invalidPositionIs400() throws Exception {
        String playerId = createPlayer("Racer");
        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":120000,"position":0,"lapsCompleted":3}
                                """.formatted(playerId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.position").exists());
    }

    @Test
    @DisplayName("a lap time longer than the whole race is 400")
    void lapLongerThanRaceIs400() throws Exception {
        String playerId = createPlayer("Racer");
        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":100000,"bestLapTimeMs":150000,"position":1,"lapsCompleted":3}
                                """.formatted(playerId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("cannot be greater")));
    }

    @Test
    @DisplayName("more laps than the track has is 400")
    void tooManyLapsIs400() throws Exception {
        String playerId = createPlayer("Racer");
        // Every track is 3 laps.
        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":400000,"position":1,"lapsCompleted":9}
                                """.formatted(playerId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("exceeds")));
    }

    @Test
    @DisplayName("a best lap reported with zero laps is 400")
    void bestLapWithoutLapsIs400() throws Exception {
        String playerId = createPlayer("Racer");
        mvc.perform(post("/api/races")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                                 "elapsedTimeMs":5000,"bestLapTimeMs":4000,"position":1,"lapsCompleted":0}
                                """.formatted(playerId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a stored race really is a row in MySQL")
    void recordsReachTheDatabase() throws Exception {
        String playerId = createPlayer("Persisted");
        String raceId = createRace(playerId, 150_000, 1);

        // Read it back out of the database directly, not through the API, so a
        // service that kept everything in a field would fail this.
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT player_id, car_id, track_id, finishing_position, "
                        + "laps_completed, total_laps, elapsed_time_ms "
                        + "FROM races WHERE id = ?", raceId);

        assertEquals(playerId, row.get("player_id"));
        assertEquals("apex-vulcan", row.get("car_id"));
        assertEquals("hawkins-streets", row.get("track_id"));
        assertEquals(1, ((Number) row.get("finishing_position")).intValue());
        assertEquals(3, ((Number) row.get("laps_completed")).intValue());
        // total_laps is copied from the track at write time, so the record keeps
        // the distance it was actually set over.
        assertEquals(3, ((Number) row.get("total_laps")).intValue());
        assertEquals(150_000L, ((Number) row.get("elapsed_time_ms")).longValue());
    }
}