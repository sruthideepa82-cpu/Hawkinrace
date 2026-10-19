package com.hawkins.nitrorun.config;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.hawkins.nitrorun.model.Car;
import com.hawkins.nitrorun.model.Track;
import com.hawkins.nitrorun.repository.CarRepository;
import com.hawkins.nitrorun.repository.TrackRepository;

/**
 * Seeds the car and track catalogues at startup.
 *
 * <p>Idempotent by construction: every row is matched on its id and either
 * inserted or updated in place. Restarting the application a hundred times
 * leaves exactly four cars and five tracks, never a hundred copies.
 *
 * <p><b>Only reference data is seeded.</b> No players and no race records are
 * invented. A leaderboard that opens with fabricated times is a leaderboard
 * nobody can trust, and "demo data" in a persistence layer is indistinguishable
 * from real data once written.
 *
 * <p>The code is the source of truth for the catalogue, so an existing row is
 * brought back in line on every boot rather than left alone. That is the right
 * trade for reference data -- the game defines these cars, and a database edit
 * that contradicts the game is a bug -- but it does mean catalogue rows are not
 * free to be customised per environment. Anything environment-specific belongs
 * in configuration, not in these tables.
 *
 * <p>Runs as an {@link ApplicationRunner}, which fires after the context is
 * ready and therefore after Flyway has migrated the schema. Seeding from a
 * constructor or a {@code @PostConstruct} would race the migrations and fail
 * with an unhelpful "table doesn't exist".
 */
@Component
public class CatalogueSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogueSeeder.class);

    private final CarRepository cars;
    private final TrackRepository tracks;

    public CatalogueSeeder(CarRepository cars, TrackRepository tracks) {
        this.cars = cars;
        this.tracks = tracks;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int addedCars = seedCars();
        int addedTracks = seedTracks();

        log.info("Catalogue seeded: {} cars ({} new), {} tracks ({} new)",
                CARS.size(), addedCars, TRACKS.size(), addedTracks);
    }

    private int seedCars() {
        int added = 0;
        for (Car seed : CARS) {
            Car existing = cars.findById(seed.getId()).orElse(null);
            if (existing == null) {
                cars.save(seed);
                added++;
                continue;
            }
            existing.setName(seed.getName());
            existing.setBlurb(seed.getBlurb());
            existing.setColor(seed.getColor());
            existing.setSpeed(seed.getSpeed());
            existing.setAcceleration(seed.getAcceleration());
            existing.setHandling(seed.getHandling());
            existing.setNitro(seed.getNitro());
            existing.setUnlocked(seed.isUnlocked());
            cars.save(existing);
        }
        return added;
    }

    private int seedTracks() {
        int added = 0;
        for (Track seed : TRACKS) {
            Track existing = tracks.findById(seed.getId()).orElse(null);
            if (existing == null) {
                tracks.save(seed);
                added++;
                continue;
            }
            existing.setName(seed.getName());
            existing.setDescription(seed.getDescription());
            existing.setDifficulty(seed.getDifficulty());
            existing.setWeather(seed.getWeather());
            existing.setEnvironment(seed.getEnvironment());
            existing.setLaps(seed.getLaps());
            existing.setLocked(seed.isLocked());
            tracks.save(existing);
        }
        return added;
    }

    // ---------------------------------------------------------------------
    // Reference data
    //
    // Ids are the frontend's own literals, so the API and the game name a car or
    // track identically. Attributes are on the game's 1-10 scale; colours are
    // 0xRRGGBB. Every track is 3 laps, matching RACE.totalLaps.
    //
    // No protected character artwork, names or branded assets appear here. The
    // cars are the game's own fictional designs and the environments are
    // generic descriptions.
    // ---------------------------------------------------------------------

    private static final List<Car> CARS = List.of(
            new Car("apex-vulcan", "APEX VULCAN",
                    "Metallic orange supercar with aggressive aerodynamics.",
                    0xff8c00, 8, 7, 6, 6, true),
            new Car("venom-verde", "VENOM VERDE",
                    "Neon-green exotic car with sharp handling.",
                    0x39ff14, 7, 8, 8, 5, true),
            new Car("shadow-gt", "SHADOW GT",
                    "Deep navy-blue performance car built for the track.",
                    0x000080, 8, 6, 7, 7, true),
            new Car("inferno-rs", "INFERNO RS",
                    "Glossy red supercar pushing raw speed.",
                    0xff0000, 9, 7, 5, 8, true));

    private static final List<Track> TRACKS = List.of(
            new Track("hawkins-streets", "HAWKINS TOWN",
                    "Neon-lit suburban streets, house lights and intersections.",
                    "MEDIUM", "RAIN", "TOWN", 3, false),
            new Track("hawkins-forest", "MIRKWOOD FOREST",
                    "Fog-bound trails through dense pine. Narrow and blind.",
                    "HARD", "FOG", "FOREST", 3, false),
            new Track("upside-down", "THE UPSIDE DOWN",
                    "Corrupted earth, tendrils and floating rock.",
                    "EXTREME", "SPORES", "CORRUPTED", 3, false),
            new Track("starcourt-run", "STARCOURT RUN",
                    "Mall lights and tight, technical turns.",
                    "MEDIUM", "CLEAR", "MALL", 3, false),
            new Track("hawkins-lab", "HAWKINS LAB",
                    "Floodlit restricted grounds. No mistakes.",
                    "HARD", "STORM", "INDUSTRIAL", 3, false));
}