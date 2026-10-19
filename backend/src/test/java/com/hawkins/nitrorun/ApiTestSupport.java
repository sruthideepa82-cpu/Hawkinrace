package com.hawkins.nitrorun;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Shared plumbing for the HTTP tests.
 *
 * <p>These run against a real MySQL, so isolation comes from emptying the
 * mutable tables between tests rather than from a fresh container.
 *
 * <p>Only {@code races} and {@code players} are cleared. {@code cars} and
 * {@code tracks} are reference data seeded once at startup, every test asserts
 * against them, and truncating and reseeding them before each test would only
 * add time and risk.
 *
 * <p>{@code races} is emptied before {@code players} so the foreign keys are
 * satisfied throughout; no {@code FOREIGN_KEY_CHECKS} toggling is needed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
abstract class ApiTestSupport {

    /**
     * The JDBC URL the suite is actually using.
     *
     * <p>Exists for {@link DatabaseIsolationTests}, which fails the build if this
     * ever points at the development database. That guard is not paranoia: the
     * {@code test} profile was once missing, and the entire suite silently ran
     * against {@code hawkins_nitro_run}, creating players in the data a developer
     * would see. A wrong annotation should break loudly, not quietly.
     */
    @org.springframework.beans.factory.annotation.Value("${spring.datasource.url}")
    protected String activeJdbcUrl;

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected JdbcTemplate jdbc;

    @BeforeEach
    void resetStore() {
        jdbc.execute("DELETE FROM races");
        jdbc.execute("DELETE FROM players");
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

    /** Row count, for asserting what actually reached the database. */
    protected int rowCount(String table) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
        return count == null ? 0 : count;
    }
}