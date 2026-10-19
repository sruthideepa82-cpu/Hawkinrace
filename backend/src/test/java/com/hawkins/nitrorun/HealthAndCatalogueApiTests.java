package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Health, cars and tracks.
 *
 * <p>The track assertions are the important ones: they check the ids the backend
 * serves are the same literals the frontend uses, which is the whole reason this
 * catalogue exists. A backend-only id would leave the selection screen unable to
 * join a track to its detail record.
 */
class HealthAndCatalogueApiTests extends ApiTestSupport {

    @Test
    @DisplayName("GET /api/health reports status, version and the storage backend")
    void health() throws Exception {
        ResultActions call = mvc.perform(get("/api/health")).andExpect(status().isOk());
        JsonNode health = bodyOf(call);

        assertEquals("UP", health.get("status").asText());
        assertEquals("nitro-run", health.get("application").asText());
        assertTrue(health.get("version").asText().length() > 0, "a version should be reported");
    }

    @Test
    @DisplayName("health now reports a durable MySQL store")
    void healthReportsDurableStorage() throws Exception {
        JsonNode health = bodyOf(mvc.perform(get("/api/health")).andExpect(status().isOk()));

        assertEquals("mysql", health.get("storage").asText());
        assertTrue(health.get("persistent").asBoolean(),
                "Phase 5 storage is durable and must say so");
    }

    @Test
    @DisplayName("health does not overclaim trust: authentication is not verification")
    void healthDoesNotOverclaimTrust() throws Exception {
        JsonNode health = bodyOf(mvc.perform(get("/api/health")).andExpect(status().isOk()));
        String message = health.get("message").asText().toLowerCase();

        // Phase 7 closed the authentication hole, but the honesty obligation did not
        // go away with it -- it moved. A token now proves *who* is submitting a
        // race; it says nothing about *whether the time is true*, because the
        // numbers still originate on the client. Health must state the guarantee it
        // can make (submission is attributed to the session's player) without
        // implying the one it cannot (the times are trustworthy).
        //
        // If this assertion is ever deleted because "auth fixes it", that is the bug.
        assertTrue(message.contains("bearer token"), message);
        assertTrue(message.contains("session"), message);
        assertFalse(message.contains("verified") || message.contains("cheat-proof"),
                "health must not claim the submitted times are trustworthy: " + message);
    }

    @Test
    @DisplayName("Actuator health is exposed and leaks no details")
    void actuatorHealth() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                // `show-details: never` means no disk/memory figures leak.
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    @Test
    @DisplayName("Actuator does not expose configuration")
    void actuatorDoesNotExposeEnv() throws Exception {
        // Would reveal the JDBC URL and, in some setups, credentials. Since
        // Phase 7 the security rules also cover this path, so the answer is 401
        // for an unauthenticated caller; either way nothing is served.
        int status = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/actuator/env"))
                .andReturn().getResponse().getStatus();
        org.junit.jupiter.api.Assertions.assertTrue(
                status == 404 || status == 401,
                "actuator/env must not be readable, got " + status);
    }

    @Test
    @DisplayName("GET /api/cars returns the four catalogue cars")
    void listCars() throws Exception {
        JsonNode cars = bodyOf(mvc.perform(get("/api/cars")).andExpect(status().isOk()));
        assertEquals(4, cars.size());
    }

    @Test
    @DisplayName("car ids match the frontend's, not invented ones")
    void carIdsMatchTheFrontend() throws Exception {
        for (String id : new String[] { "apex-vulcan", "venom-verde", "shadow-gt", "inferno-rs" }) {
            mvc.perform(get("/api/cars/" + id))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(id));
        }
    }

    @Test
    @DisplayName("a car carries handling, acceleration and a visual identifier")
    void carShape() throws Exception {
        mvc.perform(get("/api/cars/apex-vulcan"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("APEX VULCAN"))
                .andExpect(jsonPath("$.speed").isNumber())
                .andExpect(jsonPath("$.acceleration").isNumber())
                .andExpect(jsonPath("$.handling").isNumber())
                .andExpect(jsonPath("$.nitro").isNumber())
                .andExpect(jsonPath("$.color").isNumber());
    }

    @Test
    @DisplayName("GET /api/tracks returns the five catalogue tracks")
    void listTracks() throws Exception {
        JsonNode tracks = bodyOf(mvc.perform(get("/api/tracks")).andExpect(status().isOk()));
        assertEquals(5, tracks.size());
    }

    @Test
    @DisplayName("track ids match the frontend's, including the renamed ones")
    void trackIdsMatchTheFrontend() throws Exception {
        for (String id : new String[] {
                "hawkins-streets", "hawkins-forest", "upside-down", "starcourt-run", "hawkins-lab" }) {
            mvc.perform(get("/api/tracks/" + id))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(id));
        }
    }

    @Test
    @DisplayName("the three named environments are all present")
    void theThreeNamedEnvironments() throws Exception {
        mvc.perform(get("/api/tracks/hawkins-streets"))
                .andExpect(jsonPath("$.name").value("HAWKINS TOWN"));
        mvc.perform(get("/api/tracks/hawkins-forest"))
                .andExpect(jsonPath("$.name").value("MIRKWOOD FOREST"));
        mvc.perform(get("/api/tracks/upside-down"))
                .andExpect(jsonPath("$.name").value("THE UPSIDE DOWN"));
    }

    @Test
    @DisplayName("no protected character names appear anywhere in the catalogue")
    void noProtectedCharacterNames() throws Exception {
        String tracks = mvc.perform(get("/api/tracks")).andReturn().getResponse().getContentAsString();
        String cars = mvc.perform(get("/api/cars")).andReturn().getResponse().getContentAsString();

        for (String name : new String[] { "steve", "mike", "dustin", "max", "will", "hopper", "joyce" }) {
            assertFalse(tracks.toLowerCase().contains(name),
                    "track payload should not reference '" + name + "'");
            assertFalse(cars.toLowerCase().contains(name),
                    "car payload should not reference '" + name + "'");
        }
    }

    @Test
    @DisplayName("the catalogue comes from the database, not a hardcoded list")
    void catalogueIsServedFromTheDatabase() throws Exception {
        // Proves the API is genuinely reading rows rather than returning
        // constants from the seeder class.
        Integer rows = jdbc.queryForObject("SELECT COUNT(*) FROM cars", Integer.class);
        assertEquals(4, rows);

        jdbc.update("UPDATE cars SET name = 'RENAMED GT' WHERE id = 'shadow-gt'");
        try {
            mvc.perform(get("/api/cars/shadow-gt"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("RENAMED GT"));
        } finally {
            jdbc.update("UPDATE cars SET name = 'SHADOW GT' WHERE id = 'shadow-gt'");
        }
    }
}