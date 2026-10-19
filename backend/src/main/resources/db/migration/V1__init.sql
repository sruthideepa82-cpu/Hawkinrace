-- ===========================================================================
-- V1 - initial schema for Hawkins: Nitro Run.
--
-- Phase 4 shipped an in-memory data layer and therefore no schema at all, so
-- this migration establishes every table from scratch.
--
-- Conventions
--   * Engine InnoDB throughout: we need real foreign keys and transactions.
--   * utf8mb4 / utf8mb4_unicode_ci, matching the server defaults, so any
--     future player name is stored correctly rather than rejected at 3 bytes.
--   * Natural, readable primary keys. Cars and tracks are keyed by the SAME
--     string ids the frontend already uses (`apex-vulcan`, `hawkins-streets`),
--     so there is no surrogate-to-natural id mapping anywhere in the system.
--     Players and races get opaque server-generated keys.
--   * No DROP, no TRUNCATE. This migration is additive and safe to re-run on
--     an empty schema; Flyway guarantees it is applied exactly once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- cars
--
-- The car catalogue. Reference data, seeded idempotently at startup.
-- ---------------------------------------------------------------------------
CREATE TABLE cars (
    id            VARCHAR(40)    NOT NULL,
    name          VARCHAR(80)    NOT NULL,
    blurb         VARCHAR(160)             DEFAULT NULL,

    -- Paint colour as 0xRRGGBB. UNSIGNED is required: a signed INT tops out at
    -- 2147483647 (0x7FFFFFFF), so values such as 0xFF0000 would still fit but
    -- anything with a high blue byte would not.
    color         INT UNSIGNED   NOT NULL,

    -- Handling attributes, on the game's 1-10 scale. Enforced by CHECK so a
    -- bad value is rejected by the database, not just by the DTO.
    speed         INT            NOT NULL,
    acceleration  INT            NOT NULL,
    handling      INT            NOT NULL,
    nitro         INT            NOT NULL,

    unlocked      BOOLEAN        NOT NULL DEFAULT TRUE,

    CONSTRAINT pk_cars PRIMARY KEY (id),
    CONSTRAINT uq_cars_name UNIQUE (name),

    CONSTRAINT ck_cars_speed        CHECK (speed        BETWEEN 1 AND 10),
    CONSTRAINT ck_cars_acceleration CHECK (acceleration BETWEEN 1 AND 10),
    CONSTRAINT ck_cars_handling     CHECK (handling     BETWEEN 1 AND 10),
    CONSTRAINT ck_cars_nitro        CHECK (nitro        BETWEEN 1 AND 10)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- tracks
--
-- The track catalogue. `config_id` is the track's identifier in the frontend's
-- track configuration (src/game/config/tracks.ts), kept alongside the display
-- name so the backend can name the exact layout a race was run on even if the
-- player-facing name is reworded later.
-- ---------------------------------------------------------------------------
CREATE TABLE tracks (
    id           VARCHAR(40)    NOT NULL,
    name         VARCHAR(80)    NOT NULL,
    description  VARCHAR(255)            DEFAULT NULL,
    difficulty   VARCHAR(30)             DEFAULT NULL,
    weather      VARCHAR(30)             DEFAULT NULL,
    environment  VARCHAR(40)             DEFAULT NULL,

    -- Laps the track is run over. Denormalised onto `races` at write time so a
    -- past result keeps the race distance it was actually set over, even if the
    -- track is later reconfigured.
    laps         INT            NOT NULL,
    locked       BOOLEAN        NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_tracks PRIMARY KEY (id),
    CONSTRAINT uq_tracks_name UNIQUE (name),

    CONSTRAINT ck_tracks_laps CHECK (laps > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- players
--
-- A player profile.
--
-- NOT an account. There is no credential column here by design: authentication
-- is a later security phase, and inventing a password column now would
-- suggest a protection that does not exist.
--
-- display_name is UNIQUE because the name is the identity a player actually
-- recognises on the leaderboard. The 409-on-duplicate behaviour of Phase 4 is
-- now enforced by the database itself rather than only by a service check.
-- ---------------------------------------------------------------------------
CREATE TABLE players (
    id               VARCHAR(24)    NOT NULL,
    display_name     VARCHAR(24)    NOT NULL,

    -- NULL until the player picks a car. SET NULL rather than RESTRICT, so a car
    -- can be retired from the catalogue without cascading into player rows.
    selected_car_id  VARCHAR(40)             DEFAULT NULL,

    created_at       TIMESTAMP(6)   NOT NULL,
    updated_at       TIMESTAMP(6)            DEFAULT NULL,

    CONSTRAINT pk_players PRIMARY KEY (id),
    CONSTRAINT uq_players_display_name UNIQUE (display_name),

    CONSTRAINT fk_players_selected_car
        FOREIGN KEY (selected_car_id) REFERENCES cars (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- races
--
-- One completed race, as reported by the client.
--
-- There is deliberately NO race_participants table. The game is single human
-- player; the opponents are AI simulated locally in Phaser and never exist on
-- the server. Modelling them would add a join, a lifecycle and a set of
-- meaningless rows to describe nothing.
--
-- Times are milliseconds, matching the frontend, which times races in ms
-- internally. Storing ms avoids a lossy seconds conversion at the boundary.
-- ---------------------------------------------------------------------------
CREATE TABLE races (
    id                VARCHAR(24)    NOT NULL,

    -- Monotonic insertion sequence.
    --
    -- `completed_at` alone cannot totally order history: Instant.now() resolves
    -- in milliseconds on Windows, so two races finished in quick succession can
    -- share a timestamp and the newest-first ordering becomes arbitrary. This
    -- column gives a stable tiebreaker that reflects real insertion order
    -- rather than a random generated id. Not the primary key, and not exposed
    -- through the API.
    seq               BIGINT         NOT NULL AUTO_INCREMENT,

    player_id         VARCHAR(24)    NOT NULL,
    car_id            VARCHAR(40)    NOT NULL,
    track_id          VARCHAR(40)    NOT NULL,

    -- Named finishing_position rather than `position`: POSITION is a built-in
    -- MySQL function name, and avoiding the collision keeps every query and
    -- future migration unambiguous.
    finishing_position INT           NOT NULL,
    laps_completed    INT            NOT NULL,
    total_laps        INT            NOT NULL,

    elapsed_time_ms   BIGINT         NOT NULL,
    best_lap_time_ms  BIGINT                  DEFAULT NULL,

    completed_at      TIMESTAMP(6)   NOT NULL,

    CONSTRAINT pk_races PRIMARY KEY (id),
    -- Satisfies the AUTO_INCREMENT key requirement and gives the sequence a
    -- uniqueness guarantee of its own.
    CONSTRAINT uq_races_seq UNIQUE (seq),

    -- A player's races belong to them. RESTRICT on car and track instead: a car
    -- or track that has results on it is history, and may not vanish.
    CONSTRAINT fk_races_player
        FOREIGN KEY (player_id) REFERENCES players (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_races_car
        FOREIGN KEY (car_id) REFERENCES cars (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_races_track
        FOREIGN KEY (track_id) REFERENCES tracks (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT ck_races_position CHECK (finishing_position >= 1),
    CONSTRAINT ck_races_laps     CHECK (laps_completed >= 0 AND laps_completed <= total_laps),
    CONSTRAINT ck_races_elapsed  CHECK (elapsed_time_ms > 0),
    -- A best lap cannot be slower than the whole race it sits inside.
    CONSTRAINT ck_races_best_lap CHECK (best_lap_time_ms IS NULL OR best_lap_time_ms <= elapsed_time_ms)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Indexes
--
-- InnoDB already indexes every foreign key column, so these are not about
-- join lookup. They exist for the two access patterns the API actually has.
-- ---------------------------------------------------------------------------

-- Race history: WHERE player_id = ? ORDER BY completed_at DESC, seq DESC.
-- Composite and descending so MySQL can satisfy both the filter and the sort
-- from the index without a filesort. `seq` is the tiebreaker for two races
-- sharing a timestamp.
CREATE INDEX idx_races_player_completed
    ON races (player_id, completed_at DESC, seq DESC);

-- Leaderboard aggregation groups by player, so it scans races ordered by
-- player_id. The FK index already covers the grouping; this one additionally
-- serves per-track breakdowns.
CREATE INDEX idx_races_track ON races (track_id);

-- Per-car statistics and "races driven in each car" lookups.
CREATE INDEX idx_races_car ON races (car_id);

-- Leaderboard ordering by pace. Partial composite on the time column so a
-- fastest-time board does not sort the full table.
CREATE INDEX idx_races_elapsed ON races (elapsed_time_ms);