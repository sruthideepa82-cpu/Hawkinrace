package com.hawkins.nitrorun.dto;

import com.hawkins.nitrorun.model.Track;

/** A track as returned by the API. */
public record TrackResponse(
        String id,
        String name,
        String description,
        String difficulty,
        String weather,
        String environment,
        int laps,
        boolean locked) {

    public static TrackResponse from(Track track) {
        return new TrackResponse(
                track.id(), track.name(), track.description(), track.difficulty(),
                track.weather(), track.environment(), track.laps(), track.locked());
    }
}
