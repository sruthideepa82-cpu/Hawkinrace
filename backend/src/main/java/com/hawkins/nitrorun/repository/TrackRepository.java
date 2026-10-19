package com.hawkins.nitrorun.repository;

import java.util.List;
import java.util.Optional;

import com.hawkins.nitrorun.model.Track;

/**
 * Read access to the track catalogue.
 *
 * <p>Seeded from the frontend's track definitions, so track ids match the game
 * exactly and the API never has to invent an id the client does not know.
 */
public interface TrackRepository {

    List<Track> findAll();

    Optional<Track> findById(String id);

    boolean existsById(String id);
}
