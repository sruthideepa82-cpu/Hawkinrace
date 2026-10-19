package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Car;

/**
 * A car as returned by the API.
 *
 * <p>A DTO rather than the {@link Car} record itself, so the wire format is an
 * explicit contract: adding a field to the domain model later will not silently
 * change what clients receive.
 */
public record CarResponse(
        String id,
        String name,
        String blurb,
        int color,
        int speed,
        int acceleration,
        int handling,
        int nitro,
        boolean unlocked) {

    public static CarResponse from(Car car) {
        return new CarResponse(
                car.id(), car.name(), car.blurb(), car.color(),
                car.speed(), car.acceleration(), car.handling(), car.nitro(), car.unlocked());
    }
}
