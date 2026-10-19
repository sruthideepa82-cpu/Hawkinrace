# Hawkins: Nitro Run — Backend

Spring Boot REST API for **HAWKINS: NITRO RUN**, a 2D top-down racing game.

```
React + TypeScript + Vite + Phaser 3        frontend, :5173
        │
        │  HTTP / REST (JSON)
        ▼
Spring Boot 3.5 (embedded Tomcat)          backend,  :8080
        │
        ▼
in-memory stores                          no database in Phase 4
```

The backend **does not run the race**. All physics, AI, collision, camera, nitro
and lap-crossing logic stays in Phaser in the browser. The backend records what
happened *after* the chequered flag — and nothing more.

---

## Phase 4 scope, and what it deliberately is not

Phase 4 delivers the REST API and the surrounding architecture, on **in-memory
storage**.

**Not in this phase — these are Phase 5:**

| Phase 5 item | Why it is absent |
|---|---|
| MySQL / any database | Phase 4 must start without one |
| Spring Data JPA | Persistence is Phase 5 |
| Schema migrations (Flyway/Liquibase) | No schema exists yet |
| Persistent leaderboard | Derived from records that are themselves in memory |
| Authentication / authorisation | Needs an identity story first — see [Security](#security) |

The repository layer is already split so that adding JPA later is a contained
change: services depend on the `com.hawkins.nitrorun.repository` **interfaces**,
and the in-memory implementations are simply one implementation of them. Phase 5
adds `@Repository` JPA implementations and deletes
`repository/inmemory/InMemoryPlayerRepository.java` and
`InMemoryRaceRecordRepository.java`. No service, controller or DTO changes.

> **Everything resets on restart.** Players, race records and the leaderboard
> live in a `ConcurrentHashMap` and a `CopyOnWriteArrayList`. Stop the process
> and they are gone. `GET /api/health` reports `storage: "memory"` and
> `persistent: false` so this is never a surprise.

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| JDK | **21** | Required. The build targets release 21; a JDK 17 will refuse to compile. |
| Maven | 3.9.x | Not installed separately — use the bundled `mvnw.cmd`. |

No database, no MySQL Workbench, no Docker.

If you do not have `java` on `PATH`, use the helper script, which finds a
suitable JDK:

```powershell
.\scripts\run-backend.ps1
```

---

## Running

### Backend

```powershell
cd backend

# Option A — helper script (finds a JDK 21+ for you, uses the dev profile)
.\scripts\run-backend.ps1

# Option B — Maven wrapper, with JAVA_HOME already pointing at a JDK 21
$env:JAVA_HOME = 'C:\path\to\jdk-21'
.\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev

# Option C — package and run the jar
.\mvnw.cmd clean package
java -jar target\nitro-run-0.0.1-SNAPSHOT.jar
```

Listens on **http://localhost:8080**.

### Frontend

Unchanged from earlier phases:

```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The frontend runs and the game is fully playable **with the backend stopped**.
That is deliberate: a missing backend degrades persistence and the leaderboard,
never gameplay.

---

## Configuration

Everything environment-specific is overridable. Defaults live in
`application.yml`; the dev and prod variants live beside it.

| Variable | Default | Purpose |
|---|---|---|
| `SERVER_PORT` | `8080` | HTTP port |
| `APP_VERSION` | `0.4.0-phase4` | Reported by `GET /api/health` |
| `CORS_ALLOWED_ORIGINS` | *(empty)* | Comma-separated browser origins |
| `SPRING_PROFILES_ACTIVE` | *(none)* | `dev`, `prod`, or unset |

**Profiles**

- `application.yml` — base. CORS is **empty by default**, so nothing is granted.
- `application-dev.yml` — allows the Vite dev server on `localhost`/`127.0.0.1`
  at ports `5173` and `5174`.
- `application-prod.yml` — no default origins. Set `CORS_ALLOWED_ORIGINS` to the
  exact deployed frontend origin, or browsers get no access.

Failing closed is deliberate. A missing environment variable in production should
close the API to browsers, not silently open it to every origin.

### CORS

`CorsConfig` registers **no** mapping when the origin list is empty, so the
browser's same-origin policy applies untouched. `allowCredentials` is off: the
API is unauthenticated and sends no cookies.

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

### Ids match the frontend exactly

The API serves the **same string ids the game uses**, so no translation or name
matching is needed on either side:

| Cars | Tracks |
|---|---|
| `apex-vulcan` | `hawkins-streets` |
| `venom-verde` | `hawkins-forest` |
| `shadow-gt` | `upside-down` |
| `inferno-rs` | `starcourt-run` |
| | `hawkins-lab` |

Times are **milliseconds** on the wire, matching the game's internal unit.

---

### Health

```bash
curl http://localhost:8080/api/health
```

```json
{
  "status": "UP",
  "application": "nitro-run",
  "version": "0.4.0-phase4",
  "storage": "memory",
  "persistent": false,
  "message": "In-memory storage: players and race records reset on restart. Player-submitted races are NOT authenticated."
}
```

Spring Boot Actuator also serves `/actuator/health` (JVM-level). Only `health`
and `info` are exposed — `env`, `beans` and `configprops` would leak
configuration, and are **not published**.

### Players

```bash
# Create  -> 201 with a Location header
curl -X POST http://localhost:8080/api/players \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"HawkinsRacer","selectedCarId":"shadow-gt"}'

# Read
curl http://localhost:8080/api/players/plr_1b3c979a

# Update
curl -X PUT http://localhost:8080/api/players/plr_1b3c979a \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"HawkinsRacer2"}'
```

The **server assigns the id and `createdAt`**; anything a client sends for those
is ignored. `PUT` preserves both, so an update cannot reassign identity or
backdate a profile.

Display names must be 3–24 characters — letters, digits, spaces, underscores or
hyphens, starting with a letter or digit. Leading/trailing whitespace is
rejected rather than trimmed, because a name that silently changes when stored
would render as two different leaderboard rows.

### Races

```bash
curl -X POST http://localhost:8080/api/races \
  -H 'Content-Type: application/json' \
  -d '{
        "playerId": "plr_1b3c979a",
        "carId": "apex-vulcan",
        "trackId": "hawkins-streets",
        "elapsedTimeMs": 134883,
        "bestLapTimeMs": 44321,
        "position": 1,
        "lapsCompleted": 3
      }'
```

Besides field-level validation, the service rejects races that parse but are
**logically impossible** — checks that need the catalogue, and so cannot be
expressed as annotations:

- the player, car or track does not exist → **404**
- `bestLapTimeMs` > `elapsedTimeMs` (a lap slower than the whole race) → **400**
- `lapsCompleted` exceeds the track's lap count → **400**
- a `bestLapTimeMs` is reported with zero laps completed → **400**

### Leaderboard

```bash
curl "http://localhost:8080/api/leaderboard?sortBy=bestTimeMs&order=asc&page=0&size=25"
```

`sortBy` is one of `score` (default), `bestTimeMs`, `racesCompleted`,
`bestPosition`. `order` is `asc` or `desc`; omitted, each key uses its natural
direction — a time and a finishing position sort **ascending** (fastest, then
1st), score and volume **descending**.

An unrecognised `sortBy` falls back to `score` instead of erroring, so an older
client gets a sensible board rather than a 400. Page size is clamped to 1–100
and a page past the end returns an empty page rather than an error.

#### Scoring rule

One row per player, aggregated over every race they have on record:

```
score = 100 × racesCompleted
      + (17 − bestPosition) × 25
      + pace

pace  = min(3000, max(0, (300_000 − bestTimeMs) / 100))
```

- **Volume** pays 100 per race. Deliberately the smallest term — it breaks ties,
  it does not decide them.
- **Position** pays 25 per place gained over 16th.
- **Pace** rewards a faster personal best, reaching zero at five minutes and
  capping at 3000, so one very fast race can outrank five slow ones without
  letting a single result dominate.

The score is returned on every row, so a client never has to reverse-engineer
how it was ranked.

---

## Errors

One shape for every failure. No stack traces, no class names, no internal
messages — the container is configured the same way
(`server.error.include-stacktrace: never`) so the framework cannot leak one
through a path the advice misses.

```json
{
  "timestamp": "2026-10-19T06:51:52.507664500Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/players",
  "fieldErrors": { "displayName": "must be 3-24 characters: ..." }
}
```

| Status | When |
|---|---|
| 200 / 201 | Success / resource created |
| 400 | Invalid input, or a logically impossible race |
| 404 | Unknown player, car, track, race or endpoint |
| 405 | Known path, wrong HTTP verb |
| 409 | Duplicate display name |
| 500 | Unexpected — logged in full, answered generically |

---

## Security

**There is no authentication. Player profiles and race submissions are not
authenticated, and nothing in this API should be trusted.**

Specifically:

- Any caller may read, create and update **any** profile by id.
- Any caller may submit **any** race for **any** player. Lap times are not
  verified in any way — the client asserts them and the API stores them.
- Ids are server-generated, so a caller cannot choose their own identity or
  overwrite a profile by guessing a known id. That is a small hardening step,
  not authorisation.

This is acceptable for a single-player game whose only writes are "I finished
this race", and the race is fully playable with the backend switched off.

**Before putting anything real behind this API**, production authentication and
authorisation must be implemented: sessions or tokens, ownership checks on
profile mutation, and a decision about whether client-reported times are ever
treated as authoritative (or whether they are labelled unverified). The
validation and error handling here will hold; the identity model will not.

### Assets

The backend contains **no protected character artwork, names or branded
assets**. The cars are the game's own fictional designs and the environments are
generic descriptions. A test asserts this so it stays true.

---

## Testing

```powershell
cd backend
.\mvnw.cmd test
```

**59 tests, all passing**, covering health, player creation and retrieval,
car/track retrieval, race creation and retrieval, race-history retrieval,
leaderboard sorting and paging, invalid input, and missing resources. All are
integration tests through `MockMvc`, plus a unit test of the scoring rule
asserted directly so a change to the arithmetic cannot hide behind a re-sort.

| Suite | What it covers |
|---|---|
| `NitroRunApplicationTests` | Context loads **with no database** |
| `HealthAndCatalogueApiTests` | Health, cars, tracks, id parity with the frontend |
| `PlayerApiTests` | Create, read, update, duplicates, invalid names |
| `RaceApiTests` | Create, read, history ordering, impossible races |
| `LeaderboardApiTests` | Ranking, sorting, paging, clamping |
| `LeaderboardScoringTests` | The scoring arithmetic, term by term |

The "context loads without a database" test is the one that would have failed
before: with the JPA starter and a datasource URL present, the application
refused to boot without MySQL.

---

## Frontend integration

The client lives in `frontend/src/services/`:

- **`api.ts`** — the only module that talks HTTP. Typed request/response
  interfaces, a configured base URL (`VITE_API_URL`, default
  `http://localhost:8080`), and error handling that distinguishes a network
  failure (status `0`) from a rejection.
- **`backend.ts`** — glue. Resolves a driver to a player profile, caches it for
  the session, and submits a finished race.

Integration points, all already in place:

| Screen | Uses | Notes |
|---|---|---|
| Race finish | `saveCompletedRace` | Fire-and-forget; never blocks the results screen |
| Car select | `getCars` | Joins on `id`, falls back to local tables |
| Track select | `getTracks` | Joins on `id`, falls back to local tables |
| Leaderboard | `getLeaderboard` | Global board; per-track filter applied client-side |

**Deliberately not wired:** the menu, race HUD, track selection and every
gameplay system are untouched. Nothing in `src/game/` imports from `src/services/`,
so Phaser cannot be coupled to the network. The game runs identically offline.

### Known gap: per-track leaderboard

The backend ranks players **overall**, across all their races. The leaderboard
screen is per-track, so when a track is selected it currently reads each visible
player's best time *on that track* from their race history — one small request
per visible player, bounded to 25.

This is correct but not ideal. A per-track ranking computed server-side, with the
score scoped to that track, is a **Phase 5/6** item.

---

## Phase 5 plan

1. MySQL schema + migrations (Flyway), entities on the existing `model` records.
2. Spring Data JPA implementations of the four repository interfaces; delete the
   in-memory ones.
3. `application-prod.yml` gains a datasource; the application stops booting
   without a reachable database.
4. Persistent leaderboard, with the same documented scoring rule.
5. Authentication and authorisation, and a decision on whether client-reported
   times are ever authoritative.
6. Per-track leaderboard, scoping the score to a single track.

---

## Project layout

```
backend/
├── pom.xml                       Java 21, Spring Boot 3.5.3, no JPA
├── scripts/run-backend.ps1       finds a JDK 21+ and starts the app
└── src/
    ├── main/java/com/hawkins/nitrorun/
    │   ├── config/               CORS, from configuration
    │   ├── controller/           HTTP endpoints only
    │   ├── service/              business logic and the scoring rule
    │   ├── dto/                  wire contract
    │   ├── model/                domain records, no persistence annotations
    │   ├── repository/           interfaces  ← Phase 5 swaps the impls here
    │   │   └── inmemory/         Phase 4 implementations
    │   ├── exception/            centralised handling, one JSON shape
    │   └── validation/           reusable rules
    ├── main/resources/           application.yml + dev / prod
    └── test/java/                59 tests
```