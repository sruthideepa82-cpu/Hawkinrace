package com.hawkins.nitrorun.model;

import java.time.Instant;

/**
 * A player profile.
 *
 * <p><b>Not authenticated.</b> Phase 4 has no accounts and no sessions: whoever
 * sends a valid request is trusted, and a client can freely create a profile
 * under any name. That is fine for a single-player game whose only writes are
 * "I finished this race", but it means these records are self-reported. Real
 * authentication and authorisation must land before any of this data is treated
 * as proof that a particular person set those times.
 *
 * @see com.hawkins.nitrorun.controller.PlayerController
 */
public record Player(
        String id,
        String displayName,
        /** Car the player last selected, or null before they pick one. */
        String selectedCarId,
        Instant createdAt) {
}
