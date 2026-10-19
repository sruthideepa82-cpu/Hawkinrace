package com.hawkins.nitrorun.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hawkins.nitrorun.dto.TrackResponse;
import com.hawkins.nitrorun.service.TrackService;

/**
 * Track catalogue.
 *
 * <p>Ids are the frontend's own -- {@code hawkins-streets} for Hawkins Town --
 * so the selection screen and the API name the same track the same way.
 */
@RestController
@RequestMapping("/api/tracks")
public class TrackController {

    private final TrackService tracks;

    public TrackController(TrackService tracks) {
        this.tracks = tracks;
    }

    /** {@code GET /api/tracks} */
    @GetMapping
    public java.util.List<TrackResponse> all() {
        return tracks.findAll();
    }

    /** {@code GET /api/tracks/{trackId}} -- 404 when the id is unknown. */
    @GetMapping("/{trackId}")
    public TrackResponse one(@PathVariable String trackId) {
        return tracks.findById(trackId);
    }
}
