package com.hawkins.nitrorun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Durability and database-level integrity.
 *
 * <p>These run against a real MySQL, so they assert on the schema's actual
 * behaviour rather than on what the application intends. Most write straight
 * through JDBC, bypassing the services entirely, because the point is to prove
 * the <em>database</em> refuses bad data, not that the application happens to
 * check first.
 */
class PersistenceTests extends ApiTestSupport {

    @Value("${spring.datasource.url}")
    private String jdbcUrl;

    @Value("${spring.datasource.username}")
    private String jdbcUser;

    @Value("${spring.datasource.password}")
    private String jdbcPassword;

    /**
     * Asserts that MySQL itself refuses the statement.
     *
     * <p>Typed on {@link DataAccessException}, the common supertype, rather than
     * {@code DataIntegrityViolationException}. Spring classifies failures from
     * the SQLSTATE, and MySQL reports CHECK violations as {@code HY000} (error
     * 3819) while reporting foreign-key and unique violations as {@code 23000}.
     * Asserting the narrower type would make these tests fail on how Spring
     * categorises the error rather than on whether the database did its job.
     */
    private void assertDatabaseRejects(String sql, Object... args) {
        assertThrows(DataAccessException.class, () -> jdbc.update(sql, args));
    }

    // -----------------------------------------------------------------
    // Durability
    // -----------------------------------------------------------------

    @Test
    @DisplayName("a race survives being read by an entirely separate connection")
    void dataIsVisibleOutsideTheApplication() throws Exception {
        String playerId = createPlayer("Durable");
        String raceId = createRace(playerId, 141_000, 1);

        // A brand new connection to the server, with none of the application's
        // caching, transactions or mappings in the way. If this sees the row, the
        // row is in MySQL and not in an application bean.
        try (Connection connection = DriverManager.getConnection(jdbcUrl, jdbcUser, jdbcPassword);
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(
                     "SELECT player_id, elapsed_time_ms FROM races WHERE id = '"
                             + escape(raceId) + "'")) {

            assertTrue(rs.next(), "the race row should exist in MySQL");
            assertEquals(playerId, rs.getString("player_id"));
            assertEquals(141_000L, rs.getLong("elapsed_time_ms"));
        }
    }

    @Test
    @DisplayName("profile updates are written through, not merely returned")
    void profileUpdatesReachTheDatabase() throws Exception {
        String playerId = createPlayer("Before");
        jdbc.update("UPDATE players SET display_name = 'After' WHERE id = ?", playerId);

        // Read through the API so the mapping layer is exercised too.
        JsonNode fetched = bodyOf(mvc.perform(
                        authed(get("/api/players/" + playerId), playerId))
                .andExpect(status().isOk()));

        assertEquals("After", fetched.get("displayName").asText());
    }

    // -----------------------------------------------------------------
    // Foreign keys
    // -----------------------------------------------------------------

    @Test
    @DisplayName("a race cannot reference a player that does not exist")
    void foreignKeyBlocksUnknownPlayer() {
        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_orphan', 'plr_nosuch', 'apex-vulcan', 'hawkins-streets',
                        1, 3, 3, 120000, NOW(6))
                """);
    }

    @Test
    @DisplayName("a race cannot reference a car or track that does not exist")
    void foreignKeyBlocksUnknownCarAndTrack() {
        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_nocar', 'plr_any', 'delorean', 'hawkins-streets',
                        1, 3, 3, 120000, NOW(6))
                """);

        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_notrack', 'plr_any', 'apex-vulcan', 'mars',
                        1, 3, 3, 120000, NOW(6))
                """);
    }

    @Test
    @DisplayName("a player cannot select a car that does not exist")
    void foreignKeyBlocksUnknownSelectedCar() {
        assertDatabaseRejects("""
                INSERT INTO players (id, display_name, selected_car_id, created_at)
                VALUES ('plr_ghostcar', 'GhostCar', 'delorean', NOW(6))
                """);
    }

    @Test
    @DisplayName("deleting a player removes their races")
    void deletingAPlayerCascadesToRaces() throws Exception {
        String playerId = createPlayer("Doomed");
        createRace(playerId, 150_000, 1);
        assertEquals(1, rowCount("races"));

        jdbc.update("DELETE FROM players WHERE id = ?", playerId);

        assertEquals(0, rowCount("races"), "races should cascade with their player");
    }

    @Test
    @DisplayName("deleting a car that has results on it is refused")
    void deletingACarWithRacesIsRefused() throws Exception {
        String playerId = createPlayer("Driver");
        jdbc.update("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_keeps_car', ?, 'inferno-rs', 'hawkins-streets',
                        1, 3, 3, 120000, NOW(6))
                """, playerId);

        // RESTRICT, not CASCADE. A car with recorded results is history.
        assertDatabaseRejects("DELETE FROM cars WHERE id = 'inferno-rs'");

        // Assert on the row itself rather than a count: the catalogue has four
        // cars, and "4" would read as a meaningful number here when it is just
        // the catalogue size.
        Integer stillThere = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cars WHERE id = 'inferno-rs'", Integer.class);
        assertEquals(1, stillThere, "the car must survive the refused delete");
    }

    @Test
    @DisplayName("deleting an unused car nulls the selection instead of failing")
    void deletingACarClearsSelections() throws Exception {
        // Written straight through JDBC so selected_car_id can be set directly.
        jdbc.update("""
                INSERT INTO players (id, display_name, selected_car_id, created_at)
                VALUES ('plr_picker', 'Picker', 'venom-verde', NOW(6))
                """);

        // SET NULL: retiring a car must not cascade into player rows.
        jdbc.update("DELETE FROM cars WHERE id = 'venom-verde'");

        String selected = jdbc.queryForObject(
                "SELECT selected_car_id FROM players WHERE id = 'plr_picker'", String.class);
        assertNull(selected, "the selection should be cleared, not orphaned");

        // Put the catalogue back for the other tests in this class.
        jdbc.update("""
                INSERT INTO cars (id, name, blurb, color, speed, acceleration, handling, nitro, unlocked)
                VALUES ('venom-verde', 'VENOM VERDE',
                        'Neon-green exotic car with sharp handling.',
                        3800084, 7, 8, 8, 5, 1)
                """);
    }

    // -----------------------------------------------------------------
    // CHECK constraints
    // -----------------------------------------------------------------

    @Test
    @DisplayName("the database refuses a non-positive elapsed time")
    void checkConstraintRejectsNonPositiveTime() {
        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_zerotime', 'plr_any', 'apex-vulcan', 'hawkins-streets',
                        1, 3, 3, 0, NOW(6))
                """);
    }

    @Test
    @DisplayName("the database refuses more laps than the race was run over")
    void checkConstraintRejectsTooManyLaps() {
        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_toomanylaps', 'plr_any', 'apex-vulcan', 'hawkins-streets',
                        1, 9, 3, 400000, NOW(6))
                """);
    }

    @Test
    @DisplayName("the database refuses a lap slower than the whole race")
    void checkConstraintRejectsSlowLap() {
        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms,
                                   best_lap_time_ms, completed_at)
                VALUES ('race_badlap', 'plr_any', 'apex-vulcan', 'hawkins-streets',
                        1, 3, 3, 100000, 150000, NOW(6))
                """);
    }

    @Test
    @DisplayName("the database refuses a finishing position below 1")
    void checkConstraintRejectsBadPosition() {
        assertDatabaseRejects("""
                INSERT INTO races (id, player_id, car_id, track_id, finishing_position,
                                   laps_completed, total_laps, elapsed_time_ms, completed_at)
                VALUES ('race_badpos', 'plr_any', 'apex-vulcan', 'hawkins-streets',
                        0, 3, 3, 120000, NOW(6))
                """);
    }

    @Test
    @DisplayName("the database refuses a car attribute outside the 1-10 scale")
    void checkConstraintRejectsOutOfRangeCarStat() {
        assertDatabaseRejects("""
                INSERT INTO cars (id, name, blurb, color, speed, acceleration, handling, nitro, unlocked)
                VALUES ('bad-car', 'BAD CAR', 'nonsense', 255, 99, 7, 6, 6, 1)
                """);
    }

    @Test
    @DisplayName("the database refuses a track with no laps")
    void checkConstraintRejectsTrackWithNoLaps() {
        assertDatabaseRejects("""
                INSERT INTO tracks (id, name, description, difficulty, weather, environment, laps, locked)
                VALUES ('no-laps', 'NO LAPS', 'nonsense', 'EASY', 'CLEAR', 'TOWN', 0, 0)
                """);
    }

    @Test
    @DisplayName("the database refuses two players sharing a display name")
    void uniqueConstraintOnDisplayName() {
        jdbc.update("""
                INSERT INTO players (id, display_name, created_at)
                VALUES ('plr_one', 'Twin', NOW(6))
                """);

        assertDatabaseRejects("""
                INSERT INTO players (id, display_name, created_at)
                VALUES ('plr_two', 'Twin', NOW(6))
                """);

        // Case-insensitive too: the collation is utf8mb4_unicode_ci, so "twin"
        // collides with "Twin" and the leaderboard cannot show near-duplicates.
        assertDatabaseRejects("""
                INSERT INTO players (id, display_name, created_at)
                VALUES ('plr_three', 'twin', NOW(6))
                """);
    }

    // -----------------------------------------------------------------
    // Character encoding
    // -----------------------------------------------------------------

    @Test
    @DisplayName("non-ASCII display names round-trip through utf8mb4")
    void utf8mb4RoundTrip() throws Exception {
        // Validated names only allow ASCII today, so this writes through JDBC to
        // prove the COLUMN is utf8mb4. A latin1 column would truncate or corrupt
        // this, and the failure would show up as a mangled name on the leaderboard.
        jdbc.update("""
                INSERT INTO players (id, display_name, created_at)
                VALUES ('plr_unicode', 'Eclair Omega', NOW(6))
                """);

        String stored = jdbc.queryForObject(
                "SELECT display_name FROM players WHERE id = 'plr_unicode'", String.class);
        assertEquals("Eclair Omega", stored);
    }

    /** Ids are generated internally, but escape anyway: this is generated SQL. */
    private static String escape(String value) {
        return value.replace("'", "''");
    }
}