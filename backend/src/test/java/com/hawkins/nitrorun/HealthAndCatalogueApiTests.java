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
    @DisplayName("health is explicit that storage is NOT persistent")
    void healthIsHonestAboutDurability() throws Exception {
        JsonNode health = bodyOf(mvc.perform(get("/api/health")).andExpect(status().isOk()));

        assertEquals("memory", health.get("storage").asText());
        assertFalse(health.get("persistent").asBoolean(),
                "Phase 4 must not claim durability it does not have");
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
}