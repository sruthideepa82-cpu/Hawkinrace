package com.hawkins.nitrorun.repository;

import java.util.List;

import com.hawkins.nitrorun.model.RaceRecord;

/**
 * Completed race records.
 *
 * <p>In-memory for Phase 4. The ordering here is what the leaderboard depends
 * on, so it is stated rather than left implicit: newest first, which for a
 * time-ordered leaderboard is then re-sorted by score in the service.
 */
public interface RaceRecordRepository {

    List<RaceRecord> findAll();

    List<RaceRecord> findByPlayerId(String playerId);

    /** Saves a new record and returns it, with its generated id. */
    RaceRecord append(RaceRecord record);

    long count();
}
