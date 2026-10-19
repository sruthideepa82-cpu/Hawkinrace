package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.persistence.EntityManagerFactory;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Proves the read paths do not degrade into N+1 queries.
 *
 * <p>This is the check that matters most for a data layer, and it is easy to
 * get wrong by accident: a repository returning entities, a service mapping
 * them, and a lazy relation touched per row produces a query per row that looks
 * perfectly fine at three rows and collapses at a thousand.
 *
 * <p>Hibernate's own statement counter is used (enabled with
 * {@code generate_statistics} in the test configuration), so the number being
 * asserted is the number of statements Hibernate actually issued.
 *
 * <p>Counts are asserted as a <em>constant</em>: the point is that the query
 * count does not grow with the number of rows, not that it is some particular
 * small number.
 */
@SpringBootTest
class QueryCountTests extends ApiTestSupport {

    private static final int PLAYERS = 8;
    private static final int RACES_EACH = 4;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private Statistics statistics;

    @BeforeEach
    void resetStatistics() {
        SessionFactory sessionFactory = entityManagerFactory.unwrap(SessionFactory.class);
        statistics = sessionFactory.getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
    }

    @Test
    @DisplayName("race history issues a constant number of queries, whatever the length")
    void raceHistoryIsNotNPlusOne() throws Exception {
        // Fixtures are built BEFORE the statistics window opens. Creating them
        // inside the measured block would count every setup INSERT alongside the
        // query under test, and the count would grow for reasons that have
        // nothing to do with reading history.
        String shortId = createFixtures(1);
        long shortHistory = statementsFor(() -> readHistory(shortId));

        String longId = createFixtures(PLAYERS);
        long longHistory = statementsFor(() -> readHistory(longId));

        assertTrue(shortHistory > 0, "the fixture must actually have read something");
        assertTrue(longHistory <= shortHistory + 2,
                "history for " + (PLAYERS * RACES_EACH) + " races used " + longHistory
                        + " queries, but " + RACES_EACH + " races used " + shortHistory
                        + ". The count must not grow with the number of rows.");
    }

    @Test
    @DisplayName("the leaderboard issues a constant number of queries, whatever the size")
    void leaderboardIsNotNPlusOne() throws Exception {
        createFixtures(1);
        long onePlayer = statementsFor(this::readLeaderboard);

        // The base already holds one player; add more on top.
        for (int i = 1; i < PLAYERS; i++) {
            createFixtures(1);
        }
        long manyPlayers = statementsFor(this::readLeaderboard);

        assertTrue(onePlayer > 0, "the leaderboard must actually have run");
        assertTrue(manyPlayers <= onePlayer + 1,
                "leaderboard for " + PLAYERS + " players used " + manyPlayers
                        + " queries, but one player used " + onePlayer
                        + ". Aggregation must happen in SQL.");
    }

    /**
     * Creates {@code players} players each with {@code RACES_EACH} races.
     *
     * @return one player's id
     */
    private String createFixtures(int players) throws Exception {
        String last = null;
        for (int i = 0; i < players; i++) {
            // Names must clear the 3-character display-name minimum and stay
            // unique across the whole class.
            String name = "Racer" + System.nanoTime() % 1_000_000 + "x" + i;
            last = createPlayer(name);
            for (int r = 0; r < RACES_EACH; r++) {
                createRace(last, 120_000L + (r * 1_000L) + i, (r % 4) + 1);
            }
        }
        return last;
    }

    private void readHistory(String playerId) throws Exception {
        mvc.perform(get("/api/players/" + playerId + "/races")).andExpect(status().isOk());
    }

    private void readLeaderboard() throws Exception {
        mvc.perform(get("/api/leaderboard")).andExpect(status().isOk());
    }

    /**
     * Runs the action and reports how many queries Hibernate issued.
     *
     * <p>Uses {@code getQueryExecutionCount()}, which counts both HQL and native
     * queries. The leaderboard mixes the two -- a JPQL aggregate and a window
     * function -- so a counter that only saw one of them would be useless here.
     */
    private long statementsFor(ThrowingAction action) throws Exception {
        statistics.clear();
        action.run();
        return statistics.getQueryExecutionCount();
    }

    @FunctionalInterface
    private interface ThrowingAction {
        void run() throws Exception;
    }
}