package com.hawkins.nitrorun.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.dto.LeaderboardEntryResponse;
import com.hawkins.nitrorun.dto.LeaderboardResponse;
import com.hawkins.nitrorun.repository.MostRecentRace;
import com.hawkins.nitrorun.repository.PlayerRaceStats;
import com.hawkins.nitrorun.repository.RaceRepository;

/**
 * Builds the leaderboard.
 *
 * <h2>Scoring rule</h2>
 *
 * <p>One row per player, computed from every race that player has on record:
 *
 * <pre>
 *   score = 100 * racesCompleted
 *         + (17 - bestPosition) * 25
 *         + pace
 * </pre>
 *
 * <p>where {@code pace = min(3000, max(0, (300_000 - bestTimeMs) / 100))}. That
 * is zero at or beyond five minutes and tops out at 3000, so it rewards a faster
 * personal best without letting a single quick race dominate. The position term
 * gives 25 points per place gained over 16th. The volume term pays 100 per race,
 * deliberately smaller than either other term: it breaks ties, it does not
 * decide them.
 *
 * <p>The rule is exposed as {@code score} on every row, so a client never has to
 * guess how it was ranked. It is unchanged from Phase 4, where it was proven
 * against hand-written expected values in {@code LeaderboardScoringTests}.
 *
 * <h2>Where the numbers come from</h2>
 *
 * <p>The aggregates are computed in SQL by
 * {@link RaceRepository#aggregatePlayerStats()} -- one query for the whole
 * board. A second query supplies each player's most recent car and track. So the
 * board costs a <em>fixed two queries</em> no matter how many players are on it;
 * there is no per-player lookup and therefore no N+1.
 *
 * <p>Sorting, ranking and paging happen here rather than in SQL because the
 * score mixes three terms and cannot be expressed as an {@code ORDER BY}
 * without restating the rule in the query -- two places to keep in step, and the
 * kind of duplication that silently diverges.
 */
@Service
@Transactional(readOnly = true)
public class LeaderboardService {

    /** Milliseconds at which the pace bonus reaches zero. */
    static final long PACE_ZERO_MS = 300_000L;

    /** Ceiling on the pace term, so no single time can dominate the board. */
    static final long MAX_PACE_POINTS = 3_000L;

    /** Points per race completed. */
    static final int POINTS_PER_RACE = 100;

    /** Points per finishing place better than last. */
    static final int POINTS_PER_PLACE = 25;

    /** Largest position the scoring rule recognises. */
    static final int LAST_PLACE = 16;

    /**
     * Keys where a SMALLER value is the better one: a time, and a finishing
     * position where 1st beats 16th.
     *
     * <p>Getting {@code bestPosition} wrong here is easy and would read as a
     * completely reasonable board: sorting it descending puts the worst drivers on
     * top, which looks fine right up until someone spots that P16 leads.
     */
    private static final Set<String> NATURALLY_ASCENDING = Set.of("bestTimeMs", "bestPosition");

    private final RaceRepository races;

    public LeaderboardService(RaceRepository races) {
        this.races = races;
    }

    /**
     * @param sortBy   one of {@code score}, {@code bestTimeMs},
     *                 {@code racesCompleted}, {@code bestPosition}. Anything else
     *                 falls back to {@code score} rather than erroring, so a
     *                 stale client cannot break the page.
     * @param order    {@code asc} or {@code desc}. Blank means each key's
     *                 natural direction.
     * @param page     zero-based page index.
     * @param pageSize rows per page; clamped to 1..100.
     */
    public LeaderboardResponse build(String sortBy, String order, int page, int pageSize) {
        List<LeaderboardEntryResponse> all = new ArrayList<>(aggregate());
        sort(all, sortBy, order);

        // Rank is stamped AFTER the requested sort, never before, so it always
        // describes the order actually returned. Numbering during aggregation
        // leaves stale values on the page: a bestTimeMs board would show rank 2
        // sitting above rank 1, because the numbering came from the score sort
        // and the rows were then reordered by time.
        //
        // The rank is the global position across the whole board, not the index
        // within this page, so page 2 continues 26, 27, ... rather than
        // restarting at 1.
        for (int i = 0; i < all.size(); i++) {
            LeaderboardEntryResponse e = all.get(i);
            all.set(i, new LeaderboardEntryResponse(
                    i + 1, e.playerId(), e.displayName(), e.carId(), e.trackId(),
                    e.racesCompleted(), e.bestTimeMs(), e.averageTimeMs(), e.bestPosition(), e.score()));
        }

        int size = Math.max(1, Math.min(pageSize, 100));
        int safePage = Math.max(0, page);
        int from = Math.min(safePage * size, all.size());
        int to = Math.min(from + size, all.size());
        List<LeaderboardEntryResponse> slice = new ArrayList<>(all.subList(from, to));

        int totalPages = all.isEmpty() ? 0 : (int) Math.ceil((double) all.size() / size);
        return new LeaderboardResponse(
                slice, safePage, size, all.size(), totalPages,
                normaliseSort(sortBy), effectiveDirection(sortBy, order));
    }

    /**
     * One entry per player with at least one race, unsorted.
     *
     * <p>Two queries total. The aggregates come from a single GROUP BY; the most
     * recent car and track come from a single window-function pass.
     */
    private List<LeaderboardEntryResponse> aggregate() {
        Map<String, MostRecentRace> latest = new HashMap<>();
        for (MostRecentRace row : races.mostRecentRacePerPlayer()) {
            latest.put(row.getPlayerId(), row);
        }

        List<LeaderboardEntryResponse> entries = new ArrayList<>();
        for (PlayerRaceStats stats : races.aggregatePlayerStats()) {
            MostRecentRace recent = latest.get(stats.playerId());
            long bestTime = stats.bestTimeMs() == null ? 0L : stats.bestTimeMs();
            int bestPosition = stats.bestPosition() == null ? LAST_PLACE : stats.bestPosition();

            entries.add(new LeaderboardEntryResponse(
                    0,
                    stats.playerId(),
                    stats.displayName(),
                    recent == null ? null : recent.getCarId(),
                    recent == null ? null : recent.getTrackId(),
                    stats.racesCompleted().intValue(),
                    (double) bestTime,
                    stats.averageTimeMs() == null ? 0.0 : stats.averageTimeMs(),
                    bestPosition,
                    score(stats.racesCompleted().intValue(), bestPosition, bestTime)));
        }
        return entries;
    }

    /**
     * The documented scoring rule.
     *
     * <p>Package-private and static so tests assert the arithmetic directly
     * instead of reverse-engineering it from a sorted list.
     */
    static long score(int racesCompleted, int bestPosition, long bestTimeMs) {
        long volume = (long) racesCompleted * POINTS_PER_RACE;
        long place = (long) (LAST_PLACE + 1 - clampPosition(bestPosition)) * POINTS_PER_PLACE;
        // Floored at zero and CAPPED. The cap matters: without it a negative
        // time -- which the DTO rejects but which could still arrive from some
        // other caller -- would produce a pace term of (300_000 + |t|) / 100 and
        // out-score every legitimate row.
        long pace = Math.min(MAX_PACE_POINTS, Math.max(0L, (PACE_ZERO_MS - bestTimeMs) / 100L));
        return volume + place + pace;
    }

    /**
     * Clamps an out-of-range finishing position to last place.
     *
     * <p>The DTO and the schema CHECK already reject anything below 1, so this
     * is only a backstop. It deliberately clamps DOWN to last place rather than
     * up to first: an invalid position of 0 must not earn the maximum place
     * bonus, which is what clamping to the nearest bound would have done.
     */
    private static int clampPosition(int position) {
        if (position < 1 || position > LAST_PLACE) {
            return LAST_PLACE;
        }
        return position;
    }

    /**
     * Sorts a ranked list.
     *
     * <p>Each key has a natural direction: a higher score, more races and a
     * better finishing position are all better, so those sort descending, while a
     * time sorts ascending (fastest first). {@code order} overrides that when it
     * is supplied; when it is absent the natural direction applies.
     *
     * <p>Ties break on score and then player id, so the ordering is total and
     * paging cannot show the same row twice or skip one. This is what makes
     * "handle ties predictably" true rather than merely intended: two players on
     * identical statistics always appear in the same relative order, on every
     * request and every page.
     */
    private static void sort(List<LeaderboardEntryResponse> entries, String sortBy, String order) {
        String key = normaliseSort(sortBy);

        boolean wantAscending = (order == null || order.isBlank())
                ? NATURALLY_ASCENDING.contains(key)
                : "asc".equalsIgnoreCase(order.trim());

        Comparator<LeaderboardEntryResponse> comparator = switch (key) {
            case "bestTimeMs" -> Comparator.comparingDouble(LeaderboardEntryResponse::bestTimeMs);
            case "racesCompleted" -> Comparator.comparingInt(LeaderboardEntryResponse::racesCompleted);
            case "bestPosition" -> Comparator.comparingInt(LeaderboardEntryResponse::bestPosition);
            default -> Comparator.comparingLong(LeaderboardEntryResponse::score);
        };
        if (!wantAscending) {
            comparator = comparator.reversed();
        }

        entries.sort(comparator.thenComparing(LeaderboardEntryResponse::playerId));
    }

    /** The direction actually applied, so the response reports what the client got. */
    private static String effectiveDirection(String sortBy, String order) {
        boolean ascending = (order == null || order.isBlank())
                ? NATURALLY_ASCENDING.contains(normaliseSort(sortBy))
                : "asc".equalsIgnoreCase(order.trim());
        return ascending ? "asc" : "desc";
    }

    private static String normaliseSort(String sortBy) {
        if (sortBy == null) {
            return "score";
        }
        String key = sortBy.trim().toLowerCase(Locale.ROOT);
        return switch (key) {
            case "besttimems", "besttime" -> "bestTimeMs";
            case "racescompleted", "races" -> "racesCompleted";
            case "bestposition", "position" -> "bestPosition";
            default -> "score";
        };
    }
}