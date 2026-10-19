package com.hawkins.nitrorun.dto;

import java.util.List;

/**
 * A page of leaderboard rows.
 *
 * <p>Wrapping the rows rather than returning a bare array is what makes paging
 * honest: the client is told how many rows exist and which slice it got,
 * instead of having to infer it from a short final page.
 */
public record LeaderboardResponse(
        List<LeaderboardEntryResponse> entries,
        int page,
        int pageSize,
        long totalEntries,
        int totalPages,
        String sortBy,
        String sortDirection) {
}
