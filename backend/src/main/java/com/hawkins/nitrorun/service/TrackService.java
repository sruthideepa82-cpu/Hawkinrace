package com.hawkins.nitrorun.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.dto.TrackResponse;
import com.hawkins.nitrorun.exception.ResourceNotFoundException;
import com.hawkins.nitrorun.model.Track;
import com.hawkins.nitrorun.repository.TrackRepository;

/** Reads the track catalogue. */
@Service
@Transactional(readOnly = true)
public class TrackService {

    private final TrackRepository tracks;

    public TrackService(TrackRepository tracks) {
        this.tracks = tracks;
    }

    public List<TrackResponse> findAll() {
        return tracks.findAll().stream().map(TrackResponse::from).toList();
    }

    public TrackResponse findById(String id) {
        return TrackResponse.from(require(id));
    }

    /** The entity, for callers that need to reference it rather than return it. */
    public Track require(String id) {
        return tracks.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No track with id '" + id + "'"));
    }

    public boolean exists(String id) {
        return id != null && tracks.existsById(id);
    }
}