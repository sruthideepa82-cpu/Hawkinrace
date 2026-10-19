package com.hawkins.nitrorun.model;

/**
 * A raceable track.
 *
 * As with {@link Car}, {@code id} is the same string the frontend uses in
 * {@code frontend/src/data/tracks.ts} -- so Hawkins Town is
 * {@code hawkins-streets} on both sides of the wire, not merely a display name
 * that has to be matched case-insensitively.
 */
public record Track(
        String id,
        String name,
        String description,
        /** MEDIUM / HARD / EXTREME, as shown on the selection card. */
        String difficulty,
        /** RAIN / FOG / SPORES / CLEAR / STORM. */
        String weather,
        /** TOWN / FOREST / CORRUPTED / MALL / INDUSTRIAL. */
        String environment,
        int laps,
        boolean locked) {
}
