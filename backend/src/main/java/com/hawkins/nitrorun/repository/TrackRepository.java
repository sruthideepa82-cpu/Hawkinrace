package com.hawkins.nitrorun.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hawkins.nitrorun.model.Track;

/**
 * Track catalogue.
 *
 * <p>Seeded idempotently at startup from the frontend's track definitions.
 */
public interface TrackRepository extends JpaRepository<Track, String> {
}