package com.hawkins.nitrorun;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Shared plumbing for the HTTP tests.
 *
 * <p>Since Phase 7 every test signs in for real. Requests go through
 * {@code POST /api/auth/register}, which hashes a password and returns a bearer
 * token, and each request carries it. Nothing here bypasses the security filter
 * chain, so the tests exercise the same authentication a browser would.
 *
 * <p>Tokens are tracked per player id, so a test with two drivers submits each
 * race under the right one's identity rather than reusing whichever token was
 * created last.
 */
@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.context.ActiveProfiles("test")
abstract class ApiTestSupport {

    /** Long enough for every rule in {@code RegisterRequest}. */
    protected static final String PASSWORD = "TestPassw0rd!";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected JdbcTemplate jdbc;

    /** playerId -> bearer token. */
    private final Map<String, String> tokensByPlayer = new HashMap<>();

    /** Display names already registered this test, so a repeat reuses the account. */
    private final Map<String, String> idByDisplayName = new HashMap<>();

    /**
     * Empty the mutable tables.
     *
     * <p>Ordered so the foreign keys hold: races, then players. Deleting a
     * player cascades to its sessions and its races, so clearing players alone
     * would be enough, but races go first anyway to keep this independent of the
     * cascade behaviour.
     */
    @BeforeEach
    void resetStore() {
        jdbc.execute("DELETE FROM races");
        jdbc.execute("DELETE FROM players");
        tokensByPlayer.clear();
        idByDisplayName.clear();
    }

    /** A registered account and the token that identifies it. */
    protected record Account(String id, String token, String displayName) {}

    /**
     * Registers a real account, or returns the existing one.
     *
     * <p>Registration goes through the HTTP endpoint rather than the repository
     * so the password hashing path is covered by every test that needs a player.
     */
    protected Account account(String displayName, String selectedCarId) throws Exception {
        String existing = idByDisplayName.get(displayName);
        if (existing != null) {
            return new Account(existing, tokensByPlayer.get(existing), displayName);
        }

        String body = "{\"displayName\":\"" + displayName + "\",\"password\":\"" + PASSWORD + "\""
                + (selectedCarId == null ? "" : ",\"selectedCarId\":\"" + selectedCarId + "\"")
                + "}";
        JsonNode created = bodyOf(mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
                .andExpect(status().isCreated()));

        String id = created.get("player").get("id").asText();
        String token = created.get("token").asText();
        tokensByPlayer.put(id, token);
        idByDisplayName.put(displayName, id);
        return new Account(id, token, displayName);
    }

    /** Creates an account and returns its id. */
    protected String createPlayer(String displayName) throws Exception {
        return account(displayName, null).id();
    }

    /**
     * The JDBC URL the suite is actually using.
     *
     * <p>Asserted by {@link DatabaseIsolationTests}. That guard is not paranoia:
     * the test profile went missing once and the entire suite silently ran
     * against the development database, leaving test rows in data a developer
     * would see. The tests were all correct; only the target was wrong, and
     * nothing in a green build revealed it.
     */
    @org.springframework.beans.factory.annotation.Value("${spring.datasource.url}")
    protected String activeJdbcUrl;

    /**
     * Adds the caller's bearer token to a request.
     *
     * <p>Takes and returns the concrete builder type: the interface
     * {@code RequestBuilder} has no {@code header} method.
     */
    protected MockHttpServletRequestBuilder authed(MockHttpServletRequestBuilder builder, String playerId) {
        String token = tokensByPlayer.get(playerId);
        if (token == null) {
            throw new IllegalStateException("No session for player " + playerId
                    + " - register the account before racing as them.");
        }
        return builder.header("Authorization", "Bearer " + token);
    }

    /** Submits a valid race as the given player and returns the new record id. */
    protected String createRace(String playerId, long elapsedMs, int position) throws Exception {
        JsonNode saved = bodyOf(mvc.perform(authed(post("/api/races"), playerId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"carId":"apex-vulcan","trackId":"hawkins-streets",
                         "elapsedTimeMs":%d,"bestLapTimeMs":%d,"position":%d,"lapsCompleted":3}
                        """.formatted(elapsedMs, Math.max(12_000L, elapsedMs / 3), position)))
                .andExpect(status().isCreated()));
        return saved.get("race").get("id").asText();
    }

    protected JsonNode bodyOf(ResultActions actions) throws Exception {
        MvcResult result = actions.andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    /** Row count, for asserting what actually reached the database. */
    protected int rowCount(String table) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
        return count == null ? 0 : count;
    }
}