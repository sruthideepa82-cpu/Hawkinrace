package com.hawkins.nitrorun.dto;

/**
 * Body of {@code GET /api/health}.
 *
 * <p>Deliberately reports the storage backend. Without it, a 200 from this
 * endpoint could be mistaken for "the data is safe", when in Phase 4 every
 * player and race record lives in memory and is lost on restart.
 */
public record HealthResponse(
        String status,
        String application,
        String version,
        String storage,
        /** Always false in Phase 4. See the note on Player. */
        boolean persistent,
        String message) {
}
