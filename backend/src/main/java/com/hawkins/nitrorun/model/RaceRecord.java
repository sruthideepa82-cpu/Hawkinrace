package com.hawkins.nitrorun.model;

import java.time.Instant;

/**
 * One completed race, as reported by the client.
 *
 * <p>Times are milliseconds to match the frontend, which times races in ms
 * internally ({@code RaceSession.hudData()} hands the HUD milliseconds). Storing
 * them in ms here avoids a lossy seconds conversion at the boundary.
 *
 * <p>Like {@link Player}, this is self-reported and unauthenticated in Phase 4.
 */
public record RaceRecord(
        String id,
        String playerId,
        String carId,
        String trackId,
        /** Finishing position, 1-based. */
        int position,
        int lapsCompleted,
        long elapsedTimeMs,
        /** Best lap of this race in ms, or null when no lap was completed. */
        Long bestLapTimeMs,
        Instant completedAt) {
}
