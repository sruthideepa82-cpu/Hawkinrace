-- ===========================================================================
-- V3 - align fixed-width columns with the entity mappings.
--
-- V2 declared `token_hash CHAR(64)` and `idempotency_key CHAR(36)`, but the
-- entities map them as ordinary sized Strings, which Hibernate types as
-- VARCHAR. With `ddl-auto: validate` the application refused to start:
--
--   Schema-validation: wrong column type encountered in column [token_hash]
--   in table [auth_tokens]; found [char], but expecting [varchar(64)]
--
-- This is the schema validator doing precisely its job -- a mismatch between
-- what Flyway created and what the entities expect is a loud failure at boot
-- rather than a silent runtime surprise.
--
-- It is fixed with a new migration rather than by editing V2. V2 has already been
-- applied and its checksum recorded, so changing it would make every subsequent
-- startup fail validation until somebody ran `flyway:repair`. Adding V3 is what
-- the documented migration rule requires.
--
-- VARCHAR rather than CHAR: MySQL CHAR pads with trailing spaces and strips them
-- on retrieval under some collations, which is a needless source of subtle
-- comparison bugs for no benefit. Both columns hold fixed-length hex and UUID
-- strings, but there is no reason to have the database enforce that.
-- ===========================================================================

ALTER TABLE auth_tokens
    MODIFY COLUMN token_hash VARCHAR(64) NOT NULL;

ALTER TABLE races
    MODIFY COLUMN idempotency_key VARCHAR(36) NULL;