package com.hawkins.nitrorun.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.hawkins.nitrorun.exception.ResourceNotFoundException;

/**
 * The player behind the current request.
 *
 * <p>The principal is the player id, set by {@link TokenAuthenticationFilter}
 * only after a live session token has been verified against the database.
 *
 * <p>This is the replacement for trusting a {@code playerId} in a request body.
 * A body field is a claim by the caller; this is a fact established by the
 * server. Controllers should take the id from here and, where a path id exists
 * too, check that the two agree.
 */
public final class CurrentPlayer {

    private CurrentPlayer() {
    }

    /** @throws ResourceNotFoundException if the request is anonymous, which the
     *         security rules should already have prevented. */
    public static String id() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResourceNotFoundException("Not authenticated");
        }
        Object principal = authentication.getPrincipal();
        if (!(principal instanceof String playerId) || playerId.isBlank()) {
            throw new ResourceNotFoundException("Not authenticated");
        }
        return playerId;
    }

    /** True when the caller is the given player. */
    public static boolean is(String playerId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && playerId.equals(authentication.getPrincipal());
    }
}