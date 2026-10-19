package com.hawkins.nitrorun.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.LeaderboardResponse;
import com.hawkins.nitrorun.service.LeaderboardService;

/**
 * {@code GET /api/leaderboard} -- players ranked by the documented score.
 *
 * <p>Sorting and paging are query parameters rather than path segments, and both
 * are forgiving: an unrecognised {@code sortBy} falls back to {@code score}
 * rather than erroring, so a client running an older build gets a sensible board
 * instead of a 400. Out-of-range paging is clamped in the service.
 *
 * <p>Empty on a fresh start, because records are in memory. That is expected.
 */
@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    private final LeaderboardService leaderboard;

    public LeaderboardController(LeaderboardService leaderboard) {
        this.leaderboard = leaderboard;
    }

    /**
     * @param sortBy  score (default), bestTimeMs, racesCompleted or bestPosition.
     * @param order   asc or desc. Left blank, each key uses its natural direction
     *                (a time sorts fastest-first, everything else highest-first).
     * @param page    zero-based page index.
     * @param size    rows per page, clamped to 1..100.
     */
    @GetMapping
    public LeaderboardResponse board(
            @RequestParam(name = "sortBy", defaultValue = "score") String sortBy,
            @RequestParam(name = "order", defaultValue = "") String order,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "25") int size) {
        return leaderboard.build(sortBy, order, page, size);
    }
}
