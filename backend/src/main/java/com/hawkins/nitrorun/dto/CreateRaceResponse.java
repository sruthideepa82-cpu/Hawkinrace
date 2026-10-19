package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Race;

/** Acknowledgement for {@code POST /api/races}. */
public record CreateRaceResponse(
        String id,
        String message,
        RaceRecordResponse race) {

    public static CreateRaceResponse saved(Race race) {
        return new CreateRaceResponse(
                race.getId(), "Race record stored", RaceRecordResponse.from(race));
    }
}
