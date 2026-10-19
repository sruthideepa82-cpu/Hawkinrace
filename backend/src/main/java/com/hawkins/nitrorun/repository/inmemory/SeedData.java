package com.hawkins.nitrorun.repository.inmemory;

import java.util.List;

import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.model.Track;

/**
 * The Phase 4 catalogue: every car and track the API can serve.
 *
 * <p>Both lists mirror {@code frontend/src/data/cars.ts} and
 * {@code frontend/src/data/tracks.ts} exactly, ids included. That mirroring is
 * the point: the ids are the contract, so the backend and the game refer to the
 * same car and the same track by the same literal. A mismatched id here would
 * surface as "no such track" from the API against a selection screen that
 * plainly shows it.
 *
 * <p><b>No protected character artwork, names or branded assets appear here.</b>
 * The cars are the game's own fictional designs and the environments are generic
 * descriptions. Nothing from Stranger Things is reproduced in the backend --
 * only the track names the game itself already ships under.
 *
 * <p>Phase 5 replaces this with rows in a database, seeded by a migration.
 */
final class SeedData {

    private SeedData() {
    }

    /** Car attributes are on the frontend's 1-10 scale, colours are 0xRRGGBB. */
    static List<Car> cars() {
        return List.of(
                new Car(
                        "apex-vulcan", "APEX VULCAN",
                        "Metallic orange supercar with aggressive aerodynamics.",
                        0xff8c00, 8, 7, 6, 6, true),
                new Car(
                        "venom-verde", "VENOM VERDE",
                        "Neon-green exotic car with sharp handling.",
                        0x39ff14, 7, 8, 8, 5, true),
                new Car(
                        "shadow-gt", "SHADOW GT",
                        "Deep navy-blue performance car built for the track.",
                        0x000080, 8, 6, 7, 7, true),
                new Car(
                        "inferno-rs", "INFERNO RS",
                        "Glossy red supercar pushing raw speed.",
                        0xff0000, 9, 7, 5, 8, true));
    }

    /**
     * Track ids are the frontend's, not display names: Hawkins Town is
     * {@code hawkins-streets} because that is what the game calls it
     * internally. Every track is 3 laps, matching {@code RACE.totalLaps}.
     */
    static List<Track> tracks() {
        return List.of(
                new Track(
                        "hawkins-streets", "HAWKINS TOWN",
                        "Neon-lit suburban streets, house lights and intersections.",
                        "MEDIUM", "RAIN", "TOWN", 3, false),
                new Track(
                        "hawkins-forest", "MIRKWOOD FOREST",
                        "Fog-bound trails through dense pine. Narrow and blind.",
                        "HARD", "FOG", "FOREST", 3, false),
                new Track(
                        "upside-down", "THE UPSIDE DOWN",
                        "Corrupted earth, tendrils and floating rock.",
                        "EXTREME", "SPORES", "CORRUPTED", 3, false),
                new Track(
                        "starcourt-run", "STARCOURT RUN",
                        "Mall lights and tight, technical turns.",
                        "MEDIUM", "CLEAR", "MALL", 3, false),
                new Track(
                        "hawkins-lab", "HAWKINS LAB",
                        "Floodlit restricted grounds. No mistakes.",
                        "HARD", "STORM", "INDUSTRIAL", 3, false));
    }
}