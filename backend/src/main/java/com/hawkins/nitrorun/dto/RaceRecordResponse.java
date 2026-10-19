package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.RaceRecord;

/**
 * A stored race record.
 *
 * <p>The car and track ids are echoed back rather than their display names, so a
 * client can join against {@code GET /api/cars} and {@code GET /api/tracks}
 * without any name matching.
 */
public record RaceRecordResponse(
        String id,
        String playerId,
        String carId,
        String trackId,
        int position,
        int lapsCompleted,
        long elapsedTimeMs,
        Long bestLapTimeMs,
        String completedAt) {

    public static RaceRecordResponse from(RaceRecord record) {
        return new RaceRecordResponse(
                record.id(), record.playerId(), record.carId(), record.trackId(),
                record.position(), record.lapsCompleted(), record.elapsedTimeMs(),
                record.bestLapTimeMs(), record.completedAt().toString());
    }
}
