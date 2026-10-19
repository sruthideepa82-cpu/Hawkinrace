package com.hawkins.nitrorun.repository;

/**
 * Aggregated race statistics for one player, as returned by the leaderboard
 * query.
 *
 * <p>A constructor-expression target rather than an interface projection: it
 * holds a value, so the aggregation happens in SQL and the result arrives
 * already assembled. An interface projection would be fetched per-row from a
 * result set without triggering a second query, but the typed constructor is
 * both cheaper and checked at compile time.
 *
 * <p>Field types deliberately match what JPQL returns for {@code count},
 * {@code min} and {@code avg} -- Long, Integer and Double respectively -- so no
 * narrowing conversion happens as the row is built.
 *
 * @param playerId       the player's id
 * @param displayName    read in the same query, so no follow-up lookup is needed
 * @param racesCompleted number of races on record
 * @param bestTimeMs     quickest elapsed time across those races
 * @param bestPosition   best (lowest) finishing position achieved
 * @param averageTimeMs  mean elapsed time
 */
public record PlayerRaceStats(
        String playerId,
        String displayName,
        Long racesCompleted,
        Long bestTimeMs,
        Integer bestPosition,
        Double averageTimeMs) {
}