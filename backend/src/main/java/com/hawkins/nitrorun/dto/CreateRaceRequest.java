package com.hawkins.nitrorun.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * Body of {@code POST /api/races}.
 *
 * <p><b>There is no {@code playerId} field, and that is the point.</b> Until
 * Phase 7 the body carried one and the server stored whatever it was given, so
 * any caller could post a race under any player id. The player is now taken from
 * the signed-in session and the field has been deleted rather than ignored:
 * a field that is present but unused is an invitation to a future developer to
 * trust it again.
 *
 * <p>Times are milliseconds, matching the frontend, which times races in ms
 * internally.
 */
public record CreateRaceRequest(

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