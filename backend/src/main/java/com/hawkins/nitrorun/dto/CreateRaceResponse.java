package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.RaceRecord;

/** Acknowledgement for {@code POST /api/races}. */
public record CreateRaceResponse(
        String id,
        String message,
        RaceRecordResponse race) {

    public static CreateRaceResponse saved(RaceRecord record) {
        return new CreateRaceResponse(
                record.id(), "Race record stored", RaceRecordResponse.from(record));
    }
}
