package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Player;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Sign-up and sign-in payloads.
 *
 * <p>Grouped in one file because they are three shapes of the same small idea,
 * and splitting them across files would triple the boilerplate for no gain.
 *
 * <p>The login handle is {@code displayName}, not a separate username. It is
 * already unique, it is already what the player recognises, and adding a second
 * identifier would only create a way for the two to disagree.
 */
public final class AuthDtos {

    private AuthDtos() {
    }

    /** Body of {@code POST /api/auth/register}. */
    public record RegisterRequest(
            @NotBlank(message = "displayName is required")
            @Size(min = 3, max = 24, message = "displayName must be 3-24 characters")
            String displayName,

            /*
             * Max 72 is not arbitrary: BCrypt silently truncates anything longer,
             * so two passwords sharing the first 72 bytes would be accepted as
             * the same. Capping it turns that into a validation error instead.
             */
            @NotBlank(message = "password is required")
            @Size(min = 8, max = 72,
                    message = "password must be 8-72 characters")
            String password,

            /* Optional: start the account on a particular car. */
            String selectedCarId) {
    }

    /** Body of {@code POST /api/auth/login}. */
    public record LoginRequest(
            @NotBlank(message = "displayName is required")
            String displayName,

            @NotBlank(message = "password is required")
            String password) {
    }

    /**
     * A successful sign-in or sign-up.
     *
     * <p>{@code expiresAt} is returned so the client can drop the token before
     * the server does, rather than waiting to be told it is invalid.
     */
    public record AuthResponse(
            String token,
            String tokenType,
            String expiresAt,
            PlayerResponse player) {

        public static AuthResponse of(String token, String expiresAt, Player player) {
            return new AuthResponse(token, "Bearer", expiresAt, PlayerResponse.from(player));
        }
    }
}