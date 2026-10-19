package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Player;

/** A player profile as returned by the API. */
public record PlayerResponse(
        String id,
        String displayName,
        String selectedCarId,
        String createdAt) {

    public static PlayerResponse from(Player player) {
        return new PlayerResponse(
                player.id(),
                player.displayName(),
                player.selectedCarId(),
                player.createdAt().toString());
    }
}
