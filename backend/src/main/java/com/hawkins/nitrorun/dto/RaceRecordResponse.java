package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Race;

/**
 * A stored race record.
 *
 * <p>The car and track ids are echoed back rather than their display names, so a
 * client can join against {@code GET /api/cars} and {@code GET /api/tracks}
 * without any name matching.
 *
 * <p>Unchanged from Phase 4 in shape. Persistence arrived without altering the
 * contract.
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

    /**
     * Reads the related ids off their lazy proxies, which costs no query.
     */
    public static RaceRecordResponse from(Race race) {
        return new RaceRecordResponse(
                race.getId(),
                race.getPlayer().getId(),
                race.getCar().getId(),
                race.getTrack().getId(),
                race.getFinishingPosition(),
                race.getLapsCompleted(),
                race.getElapsedTimeMs(),
                race.getBestLapTimeMs(),
                race.getCompletedAt().toString());
    }
}