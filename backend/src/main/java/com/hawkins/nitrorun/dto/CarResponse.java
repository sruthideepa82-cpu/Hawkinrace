package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Car;

/**
 * A car as returned by the API.
 *
 * <p>A DTO rather than the {@link Car} entity, so the wire format is an
 * explicit contract: adding a column later will not silently change what
 * clients receive, and no persistence annotation leaks into the API.
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
                car.getId(), car.getName(), car.getBlurb(), car.getColor(),
                car.getSpeed(), car.getAcceleration(), car.getHandling(),
                car.getNitro(), car.isUnlocked());
    }
}