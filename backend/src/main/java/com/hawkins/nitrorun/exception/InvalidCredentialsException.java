package com.hawkins.nitrorun.exception;

/**
 * Sign-in failed. Maps to HTTP 401.
 *
 * <p>One type for an unknown display name, a wrong password and a legacy
 * account with no password. Collapsing them is deliberate: a separate message
 * for each would let anyone enumerate which display names exist by watching the
 * responses.
 */
public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException(String message) {
        super(message);
    }
}