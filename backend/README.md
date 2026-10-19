# Hawkins: Nitro Run — Backend

Spring Boot REST API for **HAWKINS: NITRO RUN**, a 2D top-down racing game.

```
React + TypeScript + Vite + Phaser 3        frontend, :5173
        │
        │  HTTP / REST (JSON)
        ▼
Spring Boot 3.5 (embedded Tomcat)          backend,  :8080
        │  JDBC, HikariCP, Flyway
        ▼
MySQL 8 (hawkins_nitro_run)                 InnoDB, utf8mb4
```

The backend **does not run the race**. All physics, AI, collision, camera, nitro
and lap-crossing logic stays in Phaser in the browser. The backend records what
happened *after* the chequered flag — and nothing more.

---

## Phase 5: MySQL persistence

Phase 4 shipped the API on an in-memory store. Phase 5 replaces it with a real
MySQL database. **The REST contract is unchanged**: same endpoints, same request
bodies, same response shapes, same status codes. The frontend needed no code
change to keep working.

What is now durable across a restart:

- player profiles and selected car
- race records and race history
- everything the leaderboard is computed from
- the car and track catalogues

> **The application now requires a database.** It refuses to start without a
> reachable MySQL. That is deliberate: a game that silently loses every
> leaderboard entry on restart is worse than one that will not boot.

### What is *not* here

| Later phase | Why it is absent |
|---|---|
| Authentication / authorisation | Needs an identity story. See [Security](#security) |
| Accounts table, passwords | Inventing a credential column now would imply a protection that does not exist |
| Server-side race verification | The game is single-player and offline; the client reports times and nothing checks them |

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| JDK | **21** | Required. The build targets release 21; a JDK 17 will refuse to compile. |
| Maven | 3.9.x | Not installed separately — use the bundled `mvnw.cmd`. |
| MySQL | **8.0+** | 8.4.9 verified here. Needs 8.0.16+ for enforced `CHECK` constraints. |

MySQL Workbench 8.0 CE is used for the admin steps below but is optional — any
MySQL client works.

---

## Setting up the database

### 1. Create the schema

In **Workbench**, connect to your server, then open a new query tab and run:

```sql
CREATE DATABASE hawkins_nitro_run
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- A separate schema for the test suite. Tests must never touch the game data.
CREATE DATABASE hawkins_nitro_run_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

`utf8mb4` is required, not cosmetic: `utf8` is a 3-byte alias in MySQL and
cannot store a 4-byte character at all.

### 2. Create a dedicated application user

**Not root.** The application should have rights on the game schemas and nothing
else:

```sql
CREATE USER 'hawkins_app'@'localhost' IDENTIFIED BY '<a strong password>';
CREATE USER 'hawkins_app'@'127.0.0.1' IDENTIFIED BY '<a strong password>';

GRANT ALL PRIVILEGES ON hawkins_nitro_run.*      TO 'hawkins_app'@'localhost';
GRANT ALL PRIVILEGES ON hawkins_nitro_run.*      TO 'hawkins_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON hawkins_nitro_run_test.* TO 'hawkins_app'@'localhost';
GRANT ALL PRIVILEGES ON hawkins_nitro_run_test.* TO 'hawkins_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

Flyway needs DDL rights on the schema, which is why this is `ALL PRIVILEGES` on
the schema rather than `SELECT/INSERT`. It has **no global privileges** and
cannot create users or databases.

### 3. Configure the environment

```powershell
cd backend
copy .env.example .env      # PowerShell
```

Then edit `.env` with your URL, username and password.

`.env` is **gitignored** and must never be committed. Only `.env.example` — which
contains placeholders and no real secrets — is tracked.

| Variable | Purpose |
|---|---|
| `DB_URL` | JDBC URL |
| `DB_USERNAME` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `SERVER_PORT` | HTTP port, default `8080` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins |
| `SPRING_PROFILES_ACTIVE` | `dev`, `prod`, or unset |

`scripts/run-backend.ps1` loads `.env` into the process environment
automatically. Values already exported in your shell win, so CI overrides the
file rather than being silently replaced by it.

---

## Running

### Backend

```powershell
cd backend
.\scripts\run-backend.ps1          # loads .env, finds a JDK 21+, uses the dev profile
```

Or explicitly:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
.\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev
```

Listens on **http://localhost:8080**. On boot it applies pending migrations,
then seeds the catalogue.

### Frontend

Unchanged:

```powershell
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

The game is fully playable with the backend stopped. A missing backend degrades
persistence and the leaderboard, never gameplay.

---

## Migrations

Flyway owns the schema. On every boot it checks for pending migrations and
applies them.

| Property | Value | Why |
|---|---|---|
| `spring.jpa.hibernate.ddl-auto` | `validate` | Never `create` or `update`. Hibernate is **not** allowed to alter tables behind Flyway's back. |
| `spring.flyway.baseline-on-migrate` | `false` | Never silently adopt an existing schema; stale tables must not survive. |
| `spring.flyway.repair-on-migrate` | `false` | A checksum mismatch means a migration was edited after being applied. That needs a human. |
| `spring.flyway.clean-disabled` | `true` (tests) | `flyway:clean` drops everything. It should not be one keystroke away. |

There is **no `DROP` or `TRUNCATE`** in any migration, and no production path
runs `flyway:clean`.

### Applying migrations by hand

Normally unnecessary — the application applies them at startup. To run them
without starting the app:

```powershell
.\mvnw.cmd flyway:migrate
```

### Adding a migration later

Create `src/main/resources/db/migration/V2__<description>.sql` and restart. Flyway
runs it once, in version order, inside a transaction where MySQL supports it.
Rules:

- **Never edit a migration that has already been applied.** Its checksum is
  recorded; changing it makes every later startup fail validation.
- **Never rename one.** A renamed file looks like a brand-new migration.
- To undo something, write a new forward migration. Do not reach for `clean`.

### Initialising a fresh database

Drop and recreate the schema, then start the application:

```sql
DROP DATABASE hawkins_nitro_run;
CREATE DATABASE hawkins_nitro_run CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Flyway recreates every table on the next boot. **This deletes all data** — it is
a development convenience, not a migration.

---

## Schema

```
cars                         tracks
  id            PK varchar    id            PK varchar
  name             UNIQUE     name             UNIQUE
  blurb                       description
  color      int unsigned     difficulty / weather / environment
  speed / acceleration        laps           > 0
  handling / nitro  1..10     locked
  unlocked                   │
       │                     │
       │  ON DELETE SET NULL │  ON DELETE RESTRICT
       v                     v
players ──────────────────── races
  id            PK varchar    id            PK varchar
  display_name     UNIQUE     seq           unique AUTO_INCREMENT
  selected_car_id  FK → cars  player_id     FK → players  ON DELETE CASCADE
  created_at                  car_id        FK → cars     ON DELETE RESTRICT
  updated_at                  track_id      FK → tracks   ON DELETE RESTRICT
                             finishing_position >= 1
                             laps_completed <= total_laps
                             total_laps
                             elapsed_time_ms > 0
                             best_lap_time_ms <= elapsed_time_ms
                             completed_at
```

### Design notes

**Ids are natural, not surrogate.** Cars and tracks are keyed by the same
strings the frontend uses (`apex-vulcan`, `hawkins-streets`). There is no
id-mapping layer anywhere in the system, so the API and the game cannot drift
apart. Players and races get short opaque keys (`plr_ab12cd34`).

**`total_laps` is denormalised onto `races`.** Copied from the track at write
time, so a past result keeps the distance it was actually set over even if the
track is later reconfigured.

**`races.seq` is a monotonic AUTO_INCREMENT.** `completed_at` alone is not a
total order — `Instant.now()` resolves in milliseconds on Windows, so two races
finished in quick succession can share a timestamp and "newest first" becomes
arbitrary. The sequence gives a stable tiebreaker. It is mapped read-only, so no
application write can forge an ordering.

**`color` is `INT UNSIGNED`.** A signed `INT` tops out at `0x7FFFFFFF`; the
high-blue values of a 24-bit colour would not fit.

**Delete behaviour is deliberate.** Deleting a player cascades to their races —
the races have no meaning without them. Deleting a car or track that has results
is **refused**: that is history. A car only referenced as someone's selection is
simply cleared to NULL.

**No `race_participants` table.** The game is single human player; opponents are
AI simulated locally in Phaser and never reach the server. A participants table
would add a join, a lifecycle and a set of meaningless rows to describe nothing.

### Constraints as the last line of defence

`CHECK` constraints hold even when a write arrives from somewhere the
application did not expect:

| Constraint | Rejects |
|---|---|
| `ck_races_position` | finishing position below 1 |
| `ck_races_laps` | more laps completed than the race was run over |
| `ck_races_elapsed` | non-positive elapsed time |
| `ck_races_best_lap` | a lap slower than the whole race |
| `ck_cars_*` (four) | a handling attribute outside 1–10 |
| `ck_tracks_laps` | a track with no laps |
| `uq_players_display_name` | two players sharing a name (case-insensitive) |

A `CHECK` violation surfaces as HTTP **409**, not 500.

---

## Seeding

`CatalogueSeeder` runs at every boot and inserts or updates the four cars and
five tracks.

**Only reference data is seeded.** No players and no race records are invented.
A leaderboard that opens with fabricated times is one nobody can trust, and
"demo data" in a persistence layer is indistinguishable from real data once
written.

Idempotent by construction — restarting a hundred times leaves exactly four cars
and five tracks.

The code is the source of truth, so an edited row is brought back in line on the
next boot. That is the right trade for reference data, but it does mean catalogue
rows are not free to be customised per environment. Anything environment
specific belongs in configuration.

---

## API

Base path `/api`. All responses are JSON.

| Method | Path | Success | Purpose |
|---|---|---|---|
| GET | `/api/health` | 200 | Status, version, storage backend |
| GET | `/api/cars` | 200 | Car catalogue |
| GET | `/api/cars/{carId}` | 200 | One car (404 if unknown) |
| GET | `/api/tracks` | 200 | Track catalogue |
| GET | `/api/tracks/{trackId}` | 200 | One track (404 if unknown) |
| GET | `/api/players` | 200 | All profiles |
| POST | `/api/players` | **201** | Create a profile |
| GET | `/api/players/{playerId}` | 200 | One profile (404 if unknown) |
| PUT | `/api/players/{playerId}` | 200 | Replace editable fields |
| GET | `/api/players/{playerId}/races` | 200 | Race history, newest first |
| POST | `/api/races` | **201** | Record a completed race |
| GET | `/api/races` | 200 | All records |
| GET | `/api/races/{raceId}` | 200 | One record (404 if unknown) |
| GET | `/api/leaderboard` | 200 | Ranked, sorted, paged |

`GET /api/health` now reports `storage: "mysql"` and `persistent: true`.

Times are **milliseconds** on the wire, matching the game's internal unit.

### Leaderboard scoring

One row per player, aggregated over every race they have:

```
score = 100 × racesCompleted
      + (17 − bestPosition) × 25
      + pace

pace  = min(3000, max(0, (300_000 − bestTimeMs) / 100))
```

- **Volume** pays 100 per race — deliberately the smallest term. It breaks ties.
- **Position** pays 25 per place gained over 16th.
- **Pace** rewards a faster personal best, zero at five minutes, capped at 3000,
  so one very fast race can outrank five slow ones without dominating.

The score is on every row, so a client never has to reverse-engineer the
ranking.

**Ties are deterministic.** Rows are ordered by the sort key, then by score, then
by player id — a total order, so the same board appears on every request and
paging can never show a row twice or skip one. `rank` is stamped *after* sorting,
so it always matches the order returned, and is a global position, so page 2
continues at 26 rather than restarting at 1.

`carId` and `trackId` on a leaderboard row are those of the player's **most
recent** race. (Phase 4 answered these arbitrarily, with whichever race came
first.) Both are fetched in a single window-function pass, so the board costs a
fixed **two queries** regardless of player count.

### Query strategy

| Endpoint | Queries |
|---|---|
| Race history | 2 — player lookup, then one indexed history read |
| Leaderboard | 2 — one SQL aggregate, one window-function pass |

`QueryCountTests` asserts these counts do **not** grow with the number of rows,
using Hibernate's own statistics. Lazy relations are only ever read through
`getId()`, which Hibernate answers from the proxy without a query.

---

## Security

**There is still no authentication. Race records remain self-reported and
unverified.**

What Phase 5 added:

- **No credentials in code or git.** Secrets come from the environment; `.env` is
  ignored and only `.env.example` is committed.
- **No root.** A dedicated least-privilege MySQL account.
- **Constraints enforce integrity at the database**, not only in application
  code, so a write from an unexpected path is still rejected.
- **Errors leak nothing.** Constraint violations return a fixed sentence;
  Hibernate's text (which quotes SQL and row values) is never returned.

What did **not** change: anyone may still read, create and update any profile,
and submit any race for any player. Lap times are not verified in any way.

> `persistent: true` means the data **survives a restart**. It does not mean the
> data is **trustworthy**. Those are different claims and only the first is true.

---

## Testing

```powershell
cd backend
.\mvnw.cmd test
```

**87 tests, all passing, against a real MySQL 8.4.9.**

| Suite | Covers |
|---|---|
| `NitroRunApplicationTests` | Context starts, Flyway applied, catalogue seeded, seeding idempotent |
| `DatabaseIsolationTests` | **The suite cannot target the development schema** |
| `HealthAndCatalogueApiTests` | Health, cars, tracks, id parity with the frontend, served from the database |
| `PlayerApiTests` | Create, read, update, duplicates, invalid names |
| `RaceApiTests` | Create, read, history ordering, impossible races, rows reach MySQL |
| `PersistenceTests` | Durability, foreign keys, CHECK constraints, utf8mb4 |
| `LeaderboardApiTests` | Ranking, sorting, ties, paging, clamping |
| `QueryCountTests` | Race history and leaderboard do not degrade into N+1 |
| `LeaderboardScoringTests` | The scoring arithmetic, term by term |

### Why a real database and not Testcontainers

Docker is not available on this machine, so Testcontainers is out. A real MySQL
tests the real thing anyway: real foreign keys, real `CHECK` enforcement, real
utf8mb4, real window functions in the leaderboard query. An in-memory database
would pass while hiding exactly the dialect differences most likely to break in
production.

The test schema name is written literally into `application-test.yml`, so a test
run cannot target the game data by accident. `DB_TEST_URL` / `DB_TEST_USERNAME` /
`DB_TEST_PASSWORD` override it.

### Reproducible integration-test procedure

```powershell
# 1. MySQL running on 127.0.0.1:3306
# 2. Schema and user exist (see "Setting up the database")
# 3. Credentials in .env
cd backend
.\mvnw.cmd clean test
```

The suite creates nothing itself: Flyway migrates `hawkins_nitro_run_test` on the
first run, and every later run reuses it. Data is cleared between tests, but the
schema is not.

> **`DatabaseIsolationTests` exists because of a real incident.** During
> development the `test` profile was silently missing from the shared test base,
> so all 86 tests ran against the *development* database and left a test player
> in data a developer would see in Workbench. The suite passed throughout —
> nothing about a green build revealed it. That test now asserts the target
> directly, and it has been verified to fail when the URL points at the game
> schema.

---

## Inspecting data in Workbench

1. Connect to `localhost:3306` as `hawkins_app` (or root).
2. Set the default schema to `hawkins_nitro_run` — double-click the schema in
   the object tree, or prefix table names.
3. Useful queries:

```sql
-- Who is on the board, as the API ranks them
SELECT p.display_name,
       COUNT(*)                       AS races,
       MIN(r.elapsed_time_ms) / 1000  AS best_seconds,
       MIN(r.finishing_position)      AS best_position
FROM races r
JOIN players p ON p.id = r.player_id
GROUP BY p.id, p.display_name
ORDER BY races DESC;

-- One player's history, newest first (same ordering the API uses)
SELECT r.track_id, r.finishing_position, r.elapsed_time_ms, r.completed_at
FROM races r
WHERE r.player_id = 'plr_xxxxxxxx'
ORDER BY r.completed_at DESC, r.seq DESC;

-- What has been applied
SELECT installed_rank, version, description, installed_on, success
FROM flyway_schema_history;
```

---

## Troubleshooting

**`Unable to obtain connection from database` / `Connection refused`**
MySQL is not running, or is on a different port or host. Check
`Get-NetTCPConnection -LocalPort 3306`. If the service is stopped, start it — for
the portable install used here: `D:\hawkins-tools\mysql\bin\mysqld.exe
--defaults-file=D:\hawkins-tools\mysql\my.ini --console`.

**`Access denied for user 'hawkins_app'`**
The user does not exist, the password is wrong, or the host does not match. The
user is created twice above, for `'localhost'` and `'127.0.0.1'`; connecting by
IP but only having a `'localhost'` account is a common cause. Verify with
`SELECT user, host FROM mysql.user;`.

**`Public Key Retrieval is not allowed`**
MySQL 8's `caching_sha2_password` against an unencrypted server. Add
`allowPublicKeyRetrieval=true` to `DB_URL` (already in `.env.example`). For a
remote database prefer a TLS URL and drop the flag.

**`Unknown database 'hawkins_nitro_run'`**
The schema was not created. See step 1 above.

**`Table ... doesn't exist` / `Schema-validation: wrong column type`**
Hibernate's `validate` found the schema does not match. Either a migration has
not been applied, or an entity and a migration have drifted apart. Check
`flyway_schema_history` before changing anything by hand.

**`Validate failed: migration checksum mismatch`**
A migration file was edited after being applied. Restore the original file. If it
genuinely must change, write a new forward migration instead. `flyway:repair`
exists for this but should be a deliberate act, not a reflex.

**`Unable to resolve spring.datasource.url` / empty credentials**
`DB_URL`, `DB_USERNAME` or `DB_PASSWORD` is unset. `scripts/run-backend.ps1`
warns and exits if any is missing.

**Port 3306 already in use**
Another MySQL instance is running. `Get-NetTCPConnection -LocalPort 3306 |
Select OwningProcess` identifies it.

---

## A note on a legacy schema

Before this phase there was an abandoned attempt at a MySQL backend that left a
schema named `hawkins_nitro_run` containing `cars`, `tracks`, `players` and
`race_results` tables — numeric auto-increment ids, a `username` column, race
times in **seconds** as doubles, and six seeded players using the game's
character names.

That schema is **incompatible** with the Phase 4 API contract and its contents
were demo rows from a `DataSeeder`, not real data. It was not deleted. Its tables
were moved to:

```
hawkins_nitro_run_legacy_20261008
```

MySQL 8 removed `RENAME DATABASE`, so the tables were relocated with
`RENAME TABLE`, which preserves every row. The original name was then reused for
the Flyway-owned schema. Nothing was dropped; the old data is still there if it
is ever wanted.

---

## Project layout

```
backend/
├── pom.xml                       Java 21, Spring Boot 3.5.3, JPA, Flyway, MySQL
├── .env.example                  credential template, no secrets
├── .env                          real credentials, gitignored
├── scripts/run-backend.ps1       loads .env, finds a JDK 21+, starts the app
└── src/
    ├── main/
    │   ├── java/com/hawkins/nitrorun/
    │   │   ├── config/           CORS from config; CatalogueSeeder
    │   │   ├── controller/       HTTP endpoints only
    │   │   ├── service/          business logic, scoring rule, transactions
    │   │   ├── dto/              wire contract
    │   │   ├── model/           JPA entities, never exposed to controllers
    │   │   ├── repository/       Spring Data repositories + query projections
    │   │   ├── exception/        centralised handling, one JSON shape
    │   │   └── validation/       reusable rules
    │   └── resources/
    │       ├── application.yml + dev / prod
    │       └── db/migration/     Flyway, versioned SQL
    └── test/java/                87 tests
```

---

## Phase 6 readiness

The persistence layer is done and the API contract is unchanged, so connecting
the frontend is now purely a client-side concern. Known gaps:

- **Per-track leaderboard** — the board ranks players overall; the screen filters
  client-side, one small request per visible player. A per-track ranking scoped
  to a single track is the obvious next server-side addition.
- **Authentication** — still absent. Race records are trusted as submitted.
- **Player statistics beyond the board** — races completed, wins and best
  position are aggregated for the leaderboard but have no endpoint of their own.

No frontend change is required to start Phase 6.