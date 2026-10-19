package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.validation.DisplayName;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/players}.
 *
 * <p>The server assigns {@code id} and {@code createdAt}; a client that sends
 * them is ignored rather than trusted, so a caller cannot choose their own
 * identity or backdate a profile.
 */
public record CreatePlayerRequest(

        @NotBlank(message = "displayName is required")
        @DisplayName
        @Size(max = 24, message = "displayName cannot exceed 24 characters")
        String displayName,

        /** Optional: the car this profile starts on. Must be a known car id. */
        @Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                message = "selectedCarId must be a car id such as apex-vulcan")
        String selectedCarId) {
}
