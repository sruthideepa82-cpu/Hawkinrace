package com.hawkins.nitrorun.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * Body of {@code POST /api/races}.
 *
 * <p>Times are milliseconds, matching the frontend, which times races in ms
 * internally. The UI divides by 1000 for display; keeping the wire unit equal to
 * the internal one removes a lossy conversion and the rounding drift that comes
 * with it.
 *
 * <p>Bounds are enforced here as well as being checked against the track in the
 * service: a fast rejection of nonsense is better than trusting every caller.
 * {@code lapsCompleted} may exceed the track's lap count in the payload only so
 * the service can compare it against the real number and produce a precise
 * message rather than a generic bound failure.
 */
public record CreateRaceRequest(

        @NotBlank(message = "playerId is required")
        String playerId,

        @NotBlank(message = "carId is required")
        String carId,

        @NotBlank(message = "trackId is required")
        String trackId,

        @Positive(message = "elapsedTimeMs must be greater than 0")
        @Max(value = 86_400_000L, message = "elapsedTimeMs cannot exceed 24 hours")
        long elapsedTimeMs,

        @Positive(message = "bestLapTimeMs must be greater than 0 when supplied")
        @Max(value = 86_400_000L, message = "bestLapTimeMs cannot exceed 24 hours")
        Long bestLapTimeMs,

        @Min(value = 1, message = "position must be at least 1")
        @Max(value = 16, message = "position cannot exceed 16")
        int position,

        @Min(value = 0, message = "lapsCompleted cannot be negative")
        @Max(value = 99, message = "lapsCompleted cannot exceed 99")
        int lapsCompleted) {
}
