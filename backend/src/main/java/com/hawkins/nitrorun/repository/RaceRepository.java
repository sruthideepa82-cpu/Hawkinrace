package com.hawkins.nitrorun.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.hawkins.nitrorun.model.Race;

/**
 * Completed race records. Durable since Phase 5.
 */
public interface RaceRepository extends JpaRepository<Race, String> {

    /**
     * A player's race history, newest first.
     *
     * <p>Derived from the method name so Spring Data generates the query; it
     * becomes a single SELECT using {@code idx_races_player_completed}, which
     * covers both the {@code player_id} filter and the sort, so no filesort.
     *
     * <p>{@code SeqDesc} is the tiebreaker. {@code completedAt} alone is not a
     * total order -- {@code Instant.now()} resolves in milliseconds on Windows,
     * so two races finished in quick succession can share a timestamp and
     * "newest first" becomes arbitrary. The sequence column reflects real
     * insertion order.
     *
     * <p>The returned {@code car} and {@code track} are lazy proxies and are
     * only ever read via {@code getId()} when building the response, which
     * Hibernate serves from the proxy. Listing a history therefore stays one
     * query rather than one per race.
     */
    List<Race> findByPlayer_IdOrderByCompletedAtDescSeqDesc(String playerId);

    /**
     * Every race, newest first. Same tiebreaker, same reasoning.
     */
    List<Race> findAllByOrderByCompletedAtDescSeqDesc();

    /**
     * Leaderboard rows, aggregated in SQL.
     *
     * <p><b>One query for the whole board.</b> Every statistic is a SQL
     * aggregate and the display name comes from the same join, so there is no
     * second lookup per player and no N+1. Grouping is on {@code p.id} and
     * {@code p.displayName} together because that is exactly the select list;
     * grouping on the id alone would not be portable.
     *
     * <p>Returns every player with at least one race. Ordering, scoring and
     * paging are applied by
     * {@link com.hawkins.nitrorun.service.LeaderboardService}, because the
     * documented score mixes volume, finishing position and pace and cannot be
     * expressed as a simple {@code ORDER BY} without duplicating the rule in
     * two places.
     */
    @Query("""
            select new com.hawkins.nitrorun.repository.PlayerRaceStats(
                p.id,
                p.displayName,
                count(r),
                min(r.elapsedTimeMs),
                min(r.finishingPosition),
                avg(r.elapsedTimeMs))
            from Race r
            join r.player p
            group by p.id, p.displayName
            """)
    List<PlayerRaceStats> aggregatePlayerStats();

    /**
     * The car and track of each player's most recent race.
     *
     * <p>A leaderboard row spans every race a player has, so "the car" and "the
     * track" are ambiguous. Phase 4 answered both arbitrarily, using whichever
     * race happened to come first in the list. This defines them as those of the
     * player's <em>most recent</em> race, which is both meaningful and
     * deterministic.
     *
     * <p>{@code ROW_NUMBER()} over {@code completed_at DESC, seq DESC} picks one
     * row per player in a single pass. This is one more query for the whole
     * board -- not one per player -- so the leaderboard still costs a fixed two
     * queries regardless of how many players are on it.
     *
     * <p>Native because window functions are not part of JPQL.
     */
    @Query(value = """
            select player_id as playerId, car_id as carId, track_id as trackId
            from (
                select player_id,
                       car_id,
                       track_id,
                       row_number() over (
                           partition by player_id
                           order by completed_at desc, seq desc
                       ) as rn
                from races
            ) ranked
            where rn = 1
            """, nativeQuery = true)
    List<MostRecentRace> mostRecentRacePerPlayer();
}