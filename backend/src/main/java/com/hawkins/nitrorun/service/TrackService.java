package com.hawkins.nitrorun.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.hawkins.nitrorun.dto.TrackResponse;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Track;
import com.hawkins.nitrorun.repository.TrackRepository;

/** Reads the track catalogue. */
@Service
public class TrackService {

    private final TrackRepository tracks;

    public TrackService(TrackRepository tracks) {
        this.tracks = tracks;
    }

    public List<TrackResponse> findAll() {
        return tracks.findAll().stream().map(TrackResponse::from).toList();
    }

    public TrackResponse findById(String id) {
        Track track = tracks.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No track with id '" + id + "'"));
        return TrackResponse.from(track);
    }

    public boolean exists(String id) {
        return id != null && tracks.existsById(id);
    }

    /** Laps the given track is run over. Used to validate a submitted race. */
    public int lapsOf(String id) {
        return tracks.findById(id)
                .map(Track::laps)
                .orElseThrow(() -> new ResourceNotFoundException("No track with id '" + id + "'"));
    }
}
