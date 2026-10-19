package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.model.Player;

/** A player profile as returned by the API. */
public record PlayerResponse(
        String id,
        String displayName,
        String selectedCarId,
        String createdAt) {

    /**
     * Reads {@code selectedCarId} off the lazy proxy.
     *
     * <p>{@code getId()} on a Hibernate proxy is answered from the proxy's own
     * identifier, so mapping a page of players issues no additional queries.
     */
    public static PlayerResponse from(Player player) {
        Car car = player.getSelectedCar();
        return new PlayerResponse(
                player.getId(),
                player.getDisplayName(),
                car == null ? null : car.getId(),
                player.getCreatedAt().toString());
    }
}