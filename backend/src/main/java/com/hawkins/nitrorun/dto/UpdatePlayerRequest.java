package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.validation.DisplayName;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Body of {@code PUT /api/players/{playerId}}.
 *
 * <p>A full replacement of the editable fields. The path id is authoritative: a
 * body cannot rename the resource it is updating.
 */
public record UpdatePlayerRequest(

        @NotBlank(message = "displayName is required")
        @DisplayName
        String displayName,

        @Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                message = "selectedCarId must be a car id such as apex-vulcan")
        String selectedCarId) {
}
