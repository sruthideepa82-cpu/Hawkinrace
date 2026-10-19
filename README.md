# HAWKINS: NITRO RUN

A 2D top-down racing game inspired by Stranger Things.

```
React + TypeScript + Vite + Phaser 3        frontend,  :5173
        │
        │  HTTP / REST (JSON)
        ▼
Spring Boot 3.5 (Java 21)                   backend,   :8080
        │  JDBC, HikariCP, Flyway
        ▼
MySQL 8  (hawkins_nitro_run)                InnoDB, utf8mb4
```

The race runs entirely in the browser. The backend records what happened after
the chequered flag — and nothing more.

---

## Quick start

```powershell
# 1. One-time: create the database and a dedicated user (see "Database setup")
# 2. Credentials
copy backend\.env.example backend\.env      # then edit it
copy frontend\.env.example frontend\.env    # optional, defaults are fine

# 3. Start everything
.\scripts\dev.ps1
```

Then open **http://localhost:5173**.

The game is **fully playable with the backend stopped** — only saving results
and the leaderboard depend on it.

**Race results are saved to an account.** Use **ACCOUNT** on the main menu to
sign up or sign in. Racing works signed-out, but a signed-out run cannot be
saved, so the menu labels the entry `SIGN IN TO SAVE RACES` rather than leaving
you to discover it after a good lap.

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | For the frontend |
| JDK | **21** | A JDK 17 will not compile the backend |
| Maven | 3.9.x | Not needed separately — `mvnw.cmd` is bundled |
| MySQL | **8.0.16+** | 8.4.9 verified here. 8.0.16+ for enforced `CHECK` constraints |
| MySQL Workbench | optional | For admin; any MySQL client works |

No Docker, no cloud services, no hosting account.

---

## Database setup

Run once in MySQL Workbench (connect to your server, open a query tab):

```sql
CREATE DATABASE hawkins_nitro_run
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Separate schema for the test suite. Tests must never touch game data.
CREATE DATABASE hawkins_nitro_run_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A dedicated application user. NOT root.
CREATE USER 'hawkins_app'@'localhost' IDENTIFIED BY '<a strong password>';
CREATE USER 'hawkins_app'@'127.0.0.1' IDENTIFIED BY '<a strong password>';

GRANT ALL PRIVILEGES ON hawkins_nitro_run.*      TO 'hawkins_app'@'localhost';
GRANT ALL PRIVILEGES ON hawkins_nitro_run.*      TO 'hawkins_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON hawkins_nitro_run_test.* TO 'hawkins_app'@'localhost';
GRANT ALL PRIVILEGES ON hawkins_nitro_run_test.* TO 'hawkins_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

**You do not create any tables.** Flyway builds the schema on first boot.

---

## Configuration

| File | Purpose |
|---|---|
| `backend/.env` | MySQL credentials and port. **Gitignored.** |
| `backend/.env.example` | The committed template, no secrets |
| `frontend/.env` | API base URL. **Gitignored.** |
| `frontend/.env.example` | The committed template |

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` | — | JDBC URL |
| `DB_USERNAME` | — | MySQL user |
| `DB_PASSWORD` | — | MySQL password |
| `SERVER_PORT` | `8080` | Backend port |
| `CORS_ALLOWED_ORIGINS` | Vite origins in `dev` | Allowed browser origins |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend URL, from the browser |

> **Never put a secret in a `VITE_*` variable.** Everything VITE_-prefixed is
> inlined into the JavaScript bundle and is public. The database is never
> contacted from the browser — that is the whole point of the backend.

`scripts/run-backend.ps1` loads `backend/.env` automatically. Values already in
your environment win, so CI overrides the file rather than being replaced by it.

---

## Ports

| Service | Port | Notes |
|---|---|---|
| MySQL | 3306 | |
| Backend | 8080 | |
| Frontend | 5173 | Vite; 5174 if 5173 is taken |

The frontend calls the backend **directly from the browser**, not through a Vite
proxy. That is why CORS matters, and why the origins must agree between
`scripts/dev.ps1 -FrontendPort` and
`backend/src/main/resources/application-dev.yml`.

---

## Running the pieces separately

```powershell
# Backend
cd backend
.\scripts\run-backend.ps1                 # loads .env, finds a JDK 21+

# Frontend
cd frontend
npm install
npm run dev
```

---

## Migrations

Flyway owns the schema and applies pending migrations on every boot.

| Property | Value | Why |
|---|---|---|
| `spring.jpa.hibernate.ddl-auto` | `validate` | Hibernate may **never** alter a table behind Flyway's back |
| `spring.flyway.baseline-on-migrate` | `false` | Never silently adopt an existing schema |
| `spring.flyway.repair-on-migrate` | `false` | A checksum mismatch needs a human, not an auto-repair |
| `spring.flyway.clean-disabled` | `true` (tests) | `flyway:clean` drops everything; it should not be one keystroke away |

No migration contains `DROP` or `TRUNCATE`, and no production path runs
`flyway:clean`.

**Adding a migration:** create `backend/src/main/resources/db/migration/V2__x.sql`
and restart. Never edit or rename a migration that has already been applied —
its checksum is recorded, and changing it makes every later startup fail
validation.

**Inspecting what has been applied:**

```sql
SELECT installed_rank, version, description, installed_on, success
FROM flyway_schema_history;
```

---

## API

Base path `/api`. Full reference in [`backend/README.md`](backend/README.md).

**Public** — no token required:

| Method | Path | Success |
|---|---|---|
| GET | `/api/health` | 200 |
| GET | `/api/cars`, `/api/cars/{id}` | 200 |
| GET | `/api/tracks`, `/api/tracks/{id}` | 200 |
| GET | `/api/leaderboard` | 200 |
| POST | `/api/auth/register` | **201** |
| POST | `/api/auth/login` | 200 |

**Authenticated** — requires `Authorization: Bearer <token>`:

| Method | Path | Success |
|---|---|---|
| GET | `/api/auth/me` | 200 |
| POST | `/api/auth/logout` | 204 |
| GET | `/api/players/me` | 200 *(the session's own profile)* |
| GET | `/api/players/{id}` | 200 *(own id only, else 404)* |
| PUT | `/api/players/{id}` | 200 *(own id only, else 404)* |
| GET | `/api/players/{id}/races` | 200 *(own id only, else 404)* |
| POST | `/api/races` | **201** *(200 on `Idempotency-Key` replay)* |
| GET | `/api/races`, `/api/races/{id}` | 200 *(own races only)* |

**Removed in Phase 7** — these existed before authentication and no longer do:

| Method | Path | Why |
|---|---|---|
| GET | `/api/players` | An open directory of every profile. Replaced by `/api/auth/me`. |
| POST | `/api/players` | Anonymous account creation. Replaced by `/api/auth/register`. |

Anything not in the table above is **denied** (`anyRequest().denyAll()`), so an
unlisted route returns 401/403 rather than falling open.

Car and track ids are the **same string literals the game uses**
(`apex-vulcan`, `hawkins-streets`), so there is no id mapping anywhere.

Times are **milliseconds** on the wire.

---

## Security boundaries

**Players are authenticated. Race times are still not verified.** Both halves of
that sentence matter, and it is worth being precise about which is which.

### What authentication now guarantees

Requests carry an opaque bearer token obtained from `POST /api/auth/login`. The
token proves *who is asking*:

- A player's profile, their race history, and their submissions are reachable
  only with a valid token. Requesting another player's id returns **404** — the
  same answer as an id that does not exist, so the endpoint cannot be used to
  discover which ids are real.
- `POST /api/races` does not accept a `playerId`. The field was **deleted**
  rather than ignored, because a present-but-unused field is an invitation to
  trust it again. Identity comes from the session, never from the request.
- Sign-out is real: the token is revoked server-side and stops working at once.
- Tokens are stored SHA-256 hashed, so a database dump cannot be replayed as live
  sessions. Passwords are BCrypt at strength 10. An unknown display name and a
  wrong password return the same error after the same work, so sign-in cannot be
  used to enumerate accounts.

`GET /api/health` reports `persistent: true`, which means the data **survives a
restart**. It says nothing about whether it is trustworthy, and no longer claims
to.

### What it does not guarantee

- Lap and race times are **reported by the client** and taken at face value. A
  token proves the submitter's identity; it does not prove their times are real.
  **Results are not cheat-proof and never will be under this design.**
- There is a plausibility floor (`MIN_PLAUSIBLE_LAP_MS`) that rejects a lap time
  no car could physically drive. This catches the realistic failure of a client
  dividing by the wrong constant. It is a sanity check, **not** anti-cheat, and
  is not presented as such.
- The bearer token lives in `localStorage`, which any script on the page can
  read. This is the standard trade-off for a token-based SPA with no cookies; it
  would only be a real problem alongside a third-party script that is not
  trusted.

### Public surface

Available without a token: `/api/health`, `/api/cars`, `/api/tracks`,
`/api/leaderboard`, `/api/auth/register`, `/api/auth/login`. The leaderboard is
public deliberately — it is the game's public face, and a row is a display name,
a car id and a time, with nothing behind it.

Everything else requires a token. Anything not explicitly named is **denied**,
not opened, so a new endpoint is unreachable until someone decides its audience.

What *is* enforced, in addition: input validation on both sides, `CHECK`
constraints and foreign keys in the database, idempotent race submission via an
`Idempotency-Key` header, credentials only in gitignored `.env` files, CORS
restricted to configured origins, and error bodies that never contain SQL, class
names or credentials.

---

## Testing

```powershell
# Frontend: 711 assertions across 12 harnesses
cd frontend
npm test

# Backend: 112 tests against a real MySQL
cd backend
.\mvnw.cmd test

# Full stack: drives the real backend against the real database
.\scripts\e2e-fullstack.ps1
```

| Suite | What it covers |
|---|---|
| `tools/apiClient.ts` | The HTTP client against a real socket: typed parsing, 400/404/500, non-JSON bodies, empty bodies, offline |
| `tools/raceSubmission.ts` | Payload building and duplicate suppression |
| `backend` `DatabaseIsolationTests` | The test suite cannot target the development schema |
| `backend` `PersistenceTests` | Durability, foreign keys, `CHECK` constraints, utf8mb4 |
| `backend` `QueryCountTests` | Race history and leaderboard do not degrade into N+1 |
| `scripts/e2e-fullstack.ps1` | The whole stack: profile → race → history → leaderboard → restart |

---

## Troubleshooting

**`Public Key Retrieval is not allowed`**
MySQL 8's `caching_sha2_password` against an unencrypted server. Add
`allowPublicKeyRetrieval=true` to `DB_URL` (already in `.env.example`).

**`Access denied for user 'hawkins_app'`**
The user may exist only for `'localhost'` while the app connects by IP. Check
`SELECT user, host FROM mysql.user;` — both hosts are created in the setup SQL.

**Every request fails with a CORS error**
The origins disagree. The dev profile allows ports 5173 and 5174 on loopback.
If you changed the Vite port, either change it back or add the origin to
`application-dev.yml`. Confirm with:

```powershell
curl.exe -i -X OPTIONS http://localhost:8080/api/cars `
  -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"
```

A `200` with `Access-Control-Allow-Origin` is allowed; a `403` is not.

**`Unknown database 'hawkins_nitro_run'`**
The schema was not created. Run the setup SQL.

**`Schema-validation: wrong column type`**
The schema does not match the entities. Check `flyway_schema_history` before
changing anything by hand.

**`Validate failed: migration checksum mismatch`**
A migration was edited after being applied. Restore the original file, or write
a new forward migration.

**Frontend loads but the leaderboard says BACKEND OFFLINE**
Expected when the backend is stopped — the game still plays. Start the backend
and reload.

**A race shows NOT SAVED**
The backend refused it or was unreachable. The results screen offers RETRY only
when retrying could actually help; a validation error is not retryable because it
would fail identically. Check the backend log.

---

## Layout

```
hawkinrace/
├── scripts/
│   ├── dev.ps1                 start MySQL + backend + frontend
│   └── e2e-fullstack.ps1       full-stack verification against real MySQL
├── backend/
│   ├── .env.example            credential template, no secrets
│   ├── scripts/run-backend.ps1
│   └── src/…                   Spring Boot, Flyway, JPA, 112 tests
└── frontend/
    ├── .env.example            VITE_API_BASE_URL template
    ├── src/
    │   ├── services/           api.ts, profile.ts, raceSubmission.ts, backend.ts
    │   ├── hooks/              usePlayerProfile, useReferenceData
    │   ├── game/               Phaser — never imports from services/
    │   └── pages/              React screens
    └── tools/                  12 headless harnesses, 711 assertions
```

Nothing under `src/game/` imports from `src/services/`. Phaser cannot reach the
network, which is what keeps the game playable offline.