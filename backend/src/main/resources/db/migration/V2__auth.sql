-- ===========================================================================
-- V2 - authentication.
--
-- Until now the API had no identity at all: any caller could read every player
-- profile and submit a race for any player id. This adds just enough to fix
-- that, and no more.
--
-- Design notes
--   * The login handle is the existing `display_name`. It is already UNIQUE and
--     it is what the player recognises as "me" on the leaderboard, so a second
--     identifier would only create a way for the two to disagree.
--   * Passwords are BCrypt hashes. `password_hash` is NULLABLE so this migration
--     applies to a database that already has players: adding a NOT NULL column
--     with no default would fail. Accounts created before Phase 7 have no
--     password and therefore cannot sign in; they are documented as needing a
--     new display name to register.
--   * Sessions are opaque random tokens stored HASHED. Hashing means a database
--     dump cannot be replayed as a set of live sessions, and it makes logout a
--     real revocation rather than a client-side token deletion.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- players.password_hash
--
-- Nullable, and deliberately never returned by any DTO.
-- ---------------------------------------------------------------------------
ALTER TABLE players
    ADD COLUMN password_hash VARCHAR(100) NULL AFTER display_name;

-- ---------------------------------------------------------------------------
-- auth_tokens
--
-- One row per signed-in session. A player may have several (phone and laptop
-- at once), so this is not one-to-one with players.
-- ---------------------------------------------------------------------------
CREATE TABLE auth_tokens (
    -- SHA-256 of the token, hex encoded. The plaintext token exists only in the
    -- client's Authorization header and is never written anywhere.
    token_hash    CHAR(64)     NOT NULL,

    player_id     VARCHAR(24)  NOT NULL,

    created_at    TIMESTAMP(6) NOT NULL,
    expires_at    TIMESTAMP(6) NOT NULL,

    CONSTRAINT pk_auth_tokens PRIMARY KEY (token_hash),

    -- CASCADE, not RESTRICT: deleting a player must take their live sessions
    -- with them. A session that outlives its owner would keep authenticating as
    -- a player row that no longer exists.
    CONSTRAINT fk_auth_tokens_player
        FOREIGN KEY (player_id) REFERENCES players (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT ck_auth_tokens_expiry CHECK (expires_at > created_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- Expired-row sweep and the "is this token still valid" lookup both filter on
-- expiry for a single player, so index that pair.
CREATE INDEX idx_auth_tokens_player_expiry
    ON auth_tokens (player_id, expires_at);

-- ---------------------------------------------------------------------------
-- race idempotency
--
-- A race is submitted once. The client already suppresses duplicates, but a
-- retry over a slow connection can arrive twice, and the client and the server
-- should not both be the only thing preventing that.
--
-- `idempotency_key` is supplied by the client as a UUID derived from the race,
-- so it is nullable: existing rows predate this and must not be forced to
-- invent a key. A NULL key simply means "no idempotency guarantee for this
-- row", which is accurate.
-- ---------------------------------------------------------------------------
ALTER TABLE races
    ADD COLUMN idempotency_key CHAR(36) NULL AFTER id;

-- UNIQUE, and nullable. MySQL allows many NULLs in a unique index, so
-- keyless rows are unaffected while a key can never be reused.
CREATE UNIQUE INDEX uq_races_idempotency ON races (idempotency_key);