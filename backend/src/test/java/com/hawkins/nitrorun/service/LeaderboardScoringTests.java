package com.hawkins.nitrorun.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;


/**
 * The scoring rule, asserted directly.
 *
 * <p>Deliberately a unit test rather than an endpoint test. If the arithmetic
 * were only observable through a sorted leaderboard, a change to the rule could
 * be "fixed" by re-sorting instead, and nothing would notice the points had
 * changed. Here the expected number is written out by hand.
 *
 * <p>Rule under test:
 *
 * <pre>
 *   score = 100 * racesCompleted
 *         + (17 - bestPosition) * 25
 *         + max(0, (300_000 - bestTimeMs) / 100)
 * </pre>
 */
class LeaderboardScoringTests {

    @Test
    @DisplayName("volume contributes 100 per race")
    void volume() {
        // 1 race, last place, no pace contribution (300s or slower).
        assertEquals(100 + (17 - 16) * 25 + 0, LeaderboardService.score(1, 16, 300_000));
        assertEquals(500 + 25, LeaderboardService.score(5, 16, 300_000));
    }

    @Test
    @DisplayName("every place gained is worth 25")
    void places() {
        long last = LeaderboardService.score(1, 16, 300_000);
        long fifteenth = LeaderboardService.score(1, 15, 300_000);
        long first = LeaderboardService.score(1, 1, 300_000);
        assertEquals(25, fifteenth - last);
        assertEquals(375, first - last);
    }

    @Test
    @DisplayName("pace reaches zero at five minutes and tops out at 3000")
    void pace() {
        // 1 race in 16th: 100 volume + 25 for the place = 125 of fixed points.
        long noPace = LeaderboardService.score(1, 16, 300_000);
        assertEquals(125, noPace);

        // 299_900ms is one pace point in.
        assertEquals(126, LeaderboardService.score(1, 16, 299_900));

        // Zero and negative elapsed both clamp to the 3000 cap.
        assertEquals(125 + 3000, LeaderboardService.score(1, 16, 0));
        assertEquals(125 + 3000, LeaderboardService.score(1, 16, -99_999));
    }

    @Test
    @DisplayName("an out-of-range position is treated as last, never rewarded")
    void positionIsClamped() {
        // A position of 0 must not earn the top-place bonus, which is what
        // clamping to the nearest bound would have done.
        long lastPlace = LeaderboardService.score(1, 16, 300_000);
        assertEquals(lastPlace, LeaderboardService.score(1, 0, 300_000));
        assertEquals(lastPlace, LeaderboardService.score(1, -3, 300_000));
        assertEquals(lastPlace, LeaderboardService.score(1, 99, 300_000));
    }

    @Test
    @DisplayName("speed is worth more than volume, deliberately")
    void pacingDominatesVolume() {
        // One very fast race should outrank five slow ones. This is the intent of
        // the rule: consistency should not let a slower player out-score a faster
        // one purely by turning up often.
        long fiveSlow = LeaderboardService.score(5, 16, 300_000);
        long oneFast = LeaderboardService.score(1, 1, 0);
        assertTrue(oneFast > fiveSlow, "one fast win should beat five slow races");
    }
}