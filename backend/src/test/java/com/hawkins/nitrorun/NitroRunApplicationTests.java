package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.hawkins.nitrorun.config.CatalogueSeeder;

/**
 * The context starts against a real MySQL, and Flyway builds the schema.
 *
 * <p>This is the exact inverse of the Phase 4 test, which asserted the context
 * loaded with <em>no</em> database. Now that persistence is the point, a context
 * that fails to reach MySQL, or a schema Flyway did not create, must fail here
 * rather than in production.
 */
@SpringBootTest
@ActiveProfiles("test")
class NitroRunApplicationTests {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private CatalogueSeeder seeder;

    /**
     * The test database is real and survives between runs, so a previous run's
     * players would otherwise make "seeding invents no game data" fail for a
     * reason that has nothing to do with the seeder.
     *
     * <p>Ordered correctly: races before players, so no foreign key is violated.
     */
    @BeforeEach
    void clearGameData() {
        jdbc.execute("DELETE FROM races");
        jdbc.execute("DELETE FROM players");
    }

    @Test
    @DisplayName("every table the application needs exists")
    void schemaIsMigrated() {
        for (String table : new String[] { "cars", "tracks", "players", "races", "flyway_schema_history" }) {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.tables "
                            + "WHERE table_schema = DATABASE() AND table_name = ?",
                    Integer.class, table);
            assertNotNull(exists);
            assertEquals(1, exists, "table '" + table + "' should exist");
        }
    }

    @Test
    @DisplayName("Flyway recorded the applied migration")
    void migrationWasApplied() {
        Integer applied = jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1", Integer.class);
        assertTrue(applied != null && applied >= 1, "at least one migration should be recorded");
    }

    @Test
    @DisplayName("the catalogue is seeded on boot")
    void catalogueIsSeeded() {
        assertEquals(4, count("cars"));
        assertEquals(5, count("tracks"));
    }

    @Test
    @DisplayName("no players or races are invented by the seeder")
    void seederInventsNoGameData() {
        // Seeded reference data only. A leaderboard that opens with fabricated
        // times is one nobody can trust.
        assertEquals(0, count("players"), "seeding must not fabricate players");
        assertEquals(0, count("races"), "seeding must not fabricate race results");
    }

    @Test
    @DisplayName("re-running the seeder changes nothing")
    void seedingIsIdempotent() {
        int carsBefore = count("cars");
        int tracksBefore = count("tracks");

        seeder.run(null);
        seeder.run(null);

        assertEquals(carsBefore, count("cars"), "re-seeding must not duplicate cars");
        assertEquals(tracksBefore, count("tracks"), "re-seeding must not duplicate tracks");
    }

    @Test
    @DisplayName("a re-seed overwrites edited reference data back to the code's values")
    void seedingRestoresCodeAsSourceOfTruth() {
        jdbc.update("UPDATE cars SET speed = 1 WHERE id = 'apex-vulcan'");
        assertEquals(1, jdbc.queryForObject(
                "SELECT speed FROM cars WHERE id = 'apex-vulcan'", Integer.class));

        seeder.run(null);

        assertEquals(8, jdbc.queryForObject(
                "SELECT speed FROM cars WHERE id = 'apex-vulcan'", Integer.class),
                "the catalogue is defined in code, so a boot restores it");
    }

    private int count(String table) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
        return n == null ? 0 : n;
    }
}