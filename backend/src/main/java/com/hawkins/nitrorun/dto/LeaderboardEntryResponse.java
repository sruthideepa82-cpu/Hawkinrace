package com.hawkins.nitrorun.dto;

/**
 * One leaderboard row.
 *
 * <p>{@code score} is exposed so the ranking rule is visible rather than
 * something a client has to reverse-engineer; {@code rank} is the 1-based
 * position after sorting.
 */
public record LeaderboardEntryResponse(
        int rank,
        String playerId,
        String displayName,
        String carId,
        String trackId,
        int racesCompleted,
        double bestTimeMs,
        double averageTimeMs,
        int bestPosition,
        long score) {
}
