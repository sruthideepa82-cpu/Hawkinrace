package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/** Creating, reading and updating player profiles. */
class PlayerApiTests extends ApiTestSupport {

    @Test
    @DisplayName("POST /api/players creates a profile and returns 201 with Location")
    void createPlayer() throws Exception {
        JsonNode created = bodyOf(mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"HawkinsRacer\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("/api/players/")))
                .andExpect(jsonPath("$.displayName").value("HawkinsRacer")));

        assertNotNull(created.get("id").asText());
        assertTrue(created.get("createdAt").asText().length() > 0, "createdAt should be set by the server");
    }

    @Test
    @DisplayName("a profile can select a car")
    void createWithCar() throws Exception {
        mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Vega\",\"selectedCarId\":\"shadow-gt\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.selectedCarId").value("shadow-gt"));
    }

    @Test
    @DisplayName("the server assigns the id; a client cannot choose it")
    void clientCannotChooseItsOwnId() throws Exception {
        // An `id` in the body is simply not part of CreatePlayerRequest, so it is
        // ignored rather than honoured.
        JsonNode created = bodyOf(mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"plr_hijacked\",\"displayName\":\"Mallory\"}"))
                .andExpect(status().isCreated()));

        assertTrue(created.get("id").asText().startsWith("plr_"));
        assertTrue(!created.get("id").asText().equals("plr_hijacked"),
                "the client-supplied id must be ignored");
    }

    @Test
    @DisplayName("GET /api/players/{id} reads it back")
    void readPlayer() throws Exception {
        String id = createPlayer("Reader");
        mvc.perform(get("/api/players/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.displayName").value("Reader"));
    }

    @Test
    @DisplayName("GET /api/players lists what exists")
    void listPlayers() throws Exception {
        createPlayer("One");
        createPlayer("Two");
        JsonNode all = bodyOf(mvc.perform(get("/api/players")).andExpect(status().isOk()));
        assertEquals(2, all.size());
    }

    @Test
    @DisplayName("PUT /api/players/{id} updates the profile")
    void updatePlayer() throws Exception {
        String id = createPlayer("Before");
        mvc.perform(put("/api/players/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"After\",\"selectedCarId\":\"venom-verde\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("After"))
                .andExpect(jsonPath("$.selectedCarId").value("venom-verde"));
    }

    @Test
    @DisplayName("PUT preserves the id and creation time")
    void updateDoesNotReassignIdentity() throws Exception {
        String id = createPlayer("Stable");
        String createdAt = bodyOf(mvc.perform(get("/api/players/" + id))
                .andExpect(status().isOk())).get("createdAt").asText();

        mvc.perform(put("/api/players/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"StillStable\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.createdAt").value(createdAt));
    }

    @Test
    @DisplayName("a duplicate display name is 409 Conflict")
    void duplicateNameConflicts() throws Exception {
        createPlayer("Twin");
        mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Twin\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    @DisplayName("the same player keeping their own name on update is not a conflict")
    void selfUpdateIsNotADuplicate() throws Exception {
        String id = createPlayer("Solo");
        mvc.perform(put("/api/players/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Solo\"}"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unknown player is 404")
    void unknownPlayerIs404() throws Exception {
        mvc.perform(get("/api/players/plr_nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    @DisplayName("updating an unknown player is 404")
    void updateUnknownIs404() throws Exception {
        mvc.perform(put("/api/players/plr_nope")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Ghost\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an invalid display name is 400 with a field error")
    void invalidNameIs400() throws Exception {
        mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"a\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.displayName").exists());
    }

    @Test
    @DisplayName("a missing display name is 400")
    void missingNameIs400() throws Exception {
        mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.displayName").exists());
    }

    @Test
    @DisplayName("an unknown car on a profile is 404")
    void unknownCarIs404() throws Exception {
        mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"BadCar\",\"selectedCarId\":\"delorean\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("malformed JSON is 400, not 500")
    void malformedJsonIs400() throws Exception {
        mvc.perform(post("/api/players")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("error bodies never carry a stack trace")
    void errorsDoNotLeakStackTraces() throws Exception {
        JsonNode error = bodyOf(mvc.perform(get("/api/players/plr_nope"))
                .andExpect(status().isNotFound()));

        String serialised = error.toString();
        org.junit.jupiter.api.Assertions.assertFalse(serialised.contains("Exception"));
        org.junit.jupiter.api.Assertions.assertFalse(serialised.contains("\tat "));
        org.junit.jupiter.api.Assertions.assertFalse(serialised.contains("com.hawkins"));
    }
}