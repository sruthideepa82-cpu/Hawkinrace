package com.hawkins.nitrorun;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hawkins.nitrorun.repository.inmemory.InMemoryPlayerRepository;
import com.hawkins.nitrorun.repository.inmemory.InMemoryRaceRecordRepository;

/**
 * Shared plumbing for the HTTP tests.
 *
 * <p>The in-memory stores are beans, so Spring's cached context would leak state
 * from one test class into the next. Clearing them before each test gives real
 * isolation without paying to rebuild the context for every class.
 *
 * <p>MockMvc is used rather than a live port: it exercises routing, validation,
 * the exception handler and serialisation exactly as a browser would hit them,
 * and does not need a free port.
 */
@SpringBootTest
@AutoConfigureMockMvc
abstract class ApiTestSupport {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    private InMemoryPlayerRepository players;

    @Autowired
    private InMemoryRaceRecordRepository races;

    @BeforeEach
    void resetStores() {
        players.clear();
        races.clear();
    }

    protected JsonNode bodyOf(ResultActions actions) throws Exception {
        MvcResult result = actions.andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    /** Creates a player and returns its generated id. */
    protected String createPlayer(String displayName) throws Exception {
        JsonNode created = bodyOf(mvc.perform(post("/api/players")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"" + displayName + "\"}"))
                .andExpect(status().isCreated()));
        return created.get("id").asText();
    }

    /** Submits a valid race for a player and returns the new record's id. */
    protected String createRace(String playerId, long elapsedMs, int position) throws Exception {
        JsonNode saved = bodyOf(mvc.perform(post("/api/races")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"playerId":"%s","carId":"apex-vulcan","trackId":"hawkins-streets",
                         "elapsedTimeMs":%d,"bestLapTimeMs":%d,"position":%d,"lapsCompleted":3}
                        """.formatted(playerId, elapsedMs, Math.max(1, elapsedMs / 3), position)))
                .andExpect(status().isCreated()));
        return saved.get("race").get("id").asText();
    }

}