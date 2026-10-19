package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/** Leaderboard ordering, sorting and paging. */
class LeaderboardApiTests extends ApiTestSupport {

    @Test
    @DisplayName("the board is empty before anything is submitted")
    void emptyBoard() throws Exception {
        JsonNode board = bodyOf(mvc.perform(get("/api/leaderboard")).andExpect(status().isOk()));
        assertEquals(0, board.get("totalEntries").asInt());
    }

    @Test
    @DisplayName("one row per player, not one per race")
    void oneRowPerPlayer() throws Exception {
        String a = createPlayer("Alice");
        String b = createPlayer("Bob");
        createRace(a, 150_000, 1);
        createRace(a, 145_000, 2);   // Alice has two
        createRace(b, 200_000, 2);   // Bob has one

        JsonNode board = bodyOf(mvc.perform(get("/api/leaderboard")).andExpect(status().isOk()));
        assertEquals(2, board.get("totalEntries").asInt());
        assertEquals(2, board.get("entries").get(0).get("racesCompleted").asInt());
    }

    @Test
    @DisplayName("default order is by score, highest first")
    void defaultOrderIsByScore() throws Exception {
        String fast = createPlayer("Fast");
        String slow = createPlayer("Slow");
        createRace(fast, 90_000, 1);
        createRace(slow, 280_000, 12);

        JsonNode entries = bodyOf(mvc.perform(get("/api/leaderboard")).andExpect(status().isOk()))
                .get("entries");

        assertEquals("Fast", entries.get(0).get("displayName").asText());
        assertEquals("Slow", entries.get(1).get("displayName").asText());
        assertTrue(entries.get(0).get("score").asLong() > entries.get(1).get("score").asLong());
    }

    @Test
    @DisplayName("ranks are 1-based and match the order returned")
    void ranksMatchOrder() throws Exception {
        String a = createPlayer("Alpha");
        String b = createPlayer("Beta");
        createRace(a, 90_000, 1);
        createRace(b, 280_000, 12);

        JsonNode entries = bodyOf(mvc.perform(get("/api/leaderboard")).andExpect(status().isOk()))
                .get("entries");
        assertEquals(1, entries.get(0).get("rank").asInt());
        assertEquals(2, entries.get(1).get("rank").asInt());
    }

    @Test
    @DisplayName("sorting by best time puts the fastest first")
    void sortByBestTime() throws Exception {
        String fast = createPlayer("Fast");
        String slow = createPlayer("Slow");
        createRace(fast, 90_000, 1);
        createRace(slow, 280_000, 12);

        JsonNode entries = bodyOf(mvc.perform(get("/api/leaderboard").param("sortBy", "bestTimeMs"))
                .andExpect(status().isOk())).get("entries");

        assertEquals("Fast", entries.get(0).get("displayName").asText());
        assertTrue(entries.get(0).get("bestTimeMs").asLong() < entries.get(1).get("bestTimeMs").asLong());
    }

    @Test
    @DisplayName("sorting by best finishing position puts the winner first")
    void sortByBestPosition() throws Exception {
        String winner = createPlayer("Winner");
        String alsoRaced = createPlayer("AlsoRaced");
        createRace(winner, 200_000, 3);
        createRace(alsoRaced, 200_000, 1);

        JsonNode entries = bodyOf(mvc.perform(get("/api/leaderboard").param("sortBy", "bestPosition"))
                .andExpect(status().isOk())).get("entries");

        assertEquals("AlsoRaced", entries.get(0).get("displayName").asText());
        assertEquals(1, entries.get(0).get("bestPosition").asInt());
    }

    @Test
    @DisplayName("an unrecognised sort key falls back to score rather than erroring")
    void unknownSortFallsBack() throws Exception {
        createRace(createPlayer("Solo"), 120_000, 1);
        JsonNode board = bodyOf(mvc.perform(get("/api/leaderboard").param("sortBy", "nonsense"))
                .andExpect(status().isOk()));
        assertEquals("score", board.get("sortBy").asText());
    }

    @Test
    @DisplayName("paging returns the requested slice and reports the totals")
    void paging() throws Exception {
        for (int i = 0; i < 5; i++) {
            // Names must clear the 3-character minimum on the display name rule.
            // Increasingly fast, so the ordering is deterministic.
            createRace(createPlayer("Racer" + i), 200_000 - (i * 10_000), 5);
        }

        JsonNode page0 = bodyOf(mvc.perform(get("/api/leaderboard").param("size", "2").param("page", "0"))
                .andExpect(status().isOk()));
        assertEquals(2, page0.get("entries").size());
        assertEquals(5, page0.get("totalEntries").asInt());
        assertEquals(3, page0.get("totalPages").asInt());

        JsonNode page2 = bodyOf(mvc.perform(get("/api/leaderboard").param("size", "2").param("page", "2"))
                .andExpect(status().isOk()));
        assertEquals(1, page2.get("entries").size());
    }

    @Test
    @DisplayName("a page past the end is empty rather than an error")
    void pageBeyondEnd() throws Exception {
        createRace(createPlayer("Solo"), 120_000, 1);
        JsonNode board = bodyOf(mvc.perform(get("/api/leaderboard").param("page", "99"))
                .andExpect(status().isOk()));
        assertEquals(0, board.get("entries").size());
    }

    @Test
    @DisplayName("an absurd page size is clamped rather than trusted")
    void pageSizeIsClamped() throws Exception {
        createRace(createPlayer("Solo"), 120_000, 1);
        JsonNode board = bodyOf(mvc.perform(get("/api/leaderboard").param("size", "100000"))
                .andExpect(status().isOk()));
        assertEquals(100, board.get("pageSize").asInt());
    }

    @Test
    @DisplayName("a negative page is clamped to the first page")
    void negativePageIsClamped() throws Exception {
        createRace(createPlayer("Solo"), 120_000, 1);
        JsonNode board = bodyOf(mvc.perform(get("/api/leaderboard").param("page", "-5"))
                .andExpect(status().isOk()));
        assertEquals(0, board.get("page").asInt());
        assertEquals(1, board.get("entries").size());
    }

    @Test
    @DisplayName("rank follows the REQUESTED sort, not the default one")
    void rankMatchesTheRequestedSort() throws Exception {
        // Deliberately chosen so the two boards disagree:
        //   Quick   one race, 90s, finished last  -> score 2225
        //   Scoring three races, 100s best, won  -> score 2700
        // A time board puts Quick first (90s < 100s); a score board puts Scoring
        // first (2700 > 2225). Rank must describe whichever was requested.
        String quick = createPlayer("Quick");
        String scoring = createPlayer("Scoring");
        createRace(quick, 90_000, 16);
        createRace(scoring, 100_000, 1);
        createRace(scoring, 150_000, 1);
        createRace(scoring, 160_000, 1);

        JsonNode byTime = bodyOf(mvc.perform(
                        get("/api/leaderboard").param("sortBy", "bestTimeMs").param("order", "asc"))
                .andExpect(status().isOk())).get("entries");

        assertEquals("Quick", byTime.get(0).get("displayName").asText());
        assertEquals(1, byTime.get(0).get("rank").asInt());
        assertEquals(2, byTime.get(1).get("rank").asInt());

        JsonNode byScore = bodyOf(mvc.perform(get("/api/leaderboard").param("sortBy", "score"))
                .andExpect(status().isOk())).get("entries");
        assertEquals("Scoring", byScore.get(0).get("displayName").asText());
        assertEquals(1, byScore.get(0).get("rank").asInt());
        assertEquals("Quick", byScore.get(1).get("displayName").asText());
        assertEquals(2, byScore.get(1).get("rank").asInt());
    }

    @Test
    @DisplayName("rank is the global position, so it continues across pages")
    void rankContinuesAcrossPages() throws Exception {
        for (int i = 0; i < 5; i++) {
            createRace(createPlayer("Racer" + i), 200_000 - (i * 10_000), 5);
        }

        JsonNode page2 = bodyOf(mvc.perform(get("/api/leaderboard").param("size", "2").param("page", "1"))
                .andExpect(status().isOk())).get("entries");

        assertEquals(2, page2.size());
        assertEquals(3, page2.get(0).get("rank").asInt());
        assertEquals(4, page2.get(1).get("rank").asInt());
    }
}