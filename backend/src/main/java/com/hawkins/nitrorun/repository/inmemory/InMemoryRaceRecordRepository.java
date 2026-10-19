package com.hawkins.nitrorun.repository.inmemory;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Repository;

import com.hawkins.nitrorun.model.RaceRecord;
import com.hawkins.nitrorun.repository.RaceRecordRepository;

/**
 * In-memory {@link RaceRecordRepository}.
 *
 * <p><b>Everything here is lost on restart.</b> Records are appended, never
 * edited, so a plain list is the honest structure -- and appends are cheap.
 *
 * <p>{@link CopyOnWriteArrayList} because reads vastly outnumber writes: a
 * race is submitted once and listed constantly, and a copy-on-write read costs
 * no locking. Insertions are O(n), which at this scale is the right trade.
 *
 * <p>Ordering is newest-first, so the leaderboard can sort by score without
 * having to re-establish submission order.
 */
@Repository
public class InMemoryRaceRecordRepository implements RaceRecordRepository {

    private final List<RaceRecord> records = new CopyOnWriteArrayList<>();

    @Override
    public List<RaceRecord> findAll() {
        return List.copyOf(records);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Newest first. Built by walking the list BACKWARDS and then stably
     * sorting by timestamp descending.
     *
     * <p>The reverse walk matters: {@code Instant.now()} resolves in milliseconds
     * on Windows, so two races submitted in the same millisecond get an identical
     * {@code completedAt}. A plain sort would leave those two in submission
     * order -- oldest first -- and the history would read as though the first
     * race had been driven last. Iterating newest-first first and then sorting
     * stably makes the newer of a tied pair stay ahead.
     */
    @Override
    public List<RaceRecord> findByPlayerId(String playerId) {
        List<RaceRecord> out = new ArrayList<>();
        List<RaceRecord> all = records;
        for (int i = all.size() - 1; i >= 0; i--) {
            if (all.get(i).playerId().equals(playerId)) {
                out.add(all.get(i));
            }
        }
        // Stable sort, so equal timestamps keep the newest-first order above.
        out.sort(Comparator.comparing(RaceRecord::completedAt).reversed());
        return List.copyOf(out);
    }

    @Override
    public RaceRecord append(RaceRecord record) {
        records.add(record);
        return record;
    }

    @Override
    public long count() {
        return records.size();
    }

    /**
     * Drops every record. Test-support only, like
     * {@link InMemoryPlayerRepository#clear()}.
     */
    public void clear() {
        records.clear();
    }
}
