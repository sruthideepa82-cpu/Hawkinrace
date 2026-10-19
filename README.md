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

| Method | Path | Success |
|---|---|---|
| GET | `/api/health` | 200 |
| GET | `/api/cars`, `/api/cars/{id}` | 200 |
| GET | `/api/tracks`, `/api/tracks/{id}` | 200 |
| GET | `/api/players`, `/api/players/{id}` | 200 |
| POST | `/api/players` | **201** |
| PUT | `/api/players/{id}` | 200 |
| GET | `/api/players/{id}/races` | 200 |
| POST | `/api/races` | **201** |
| GET | `/api/races`, `/api/races/{id}` | 200 |
| GET | `/api/leaderboard` | 200 |

Car and track ids are the **same string literals the game uses**
(`apex-vulcan`, `hawkins-streets`), so there is no id mapping anywhere.

Times are **milliseconds** on the wire.

---

## Security boundaries

**There is no authentication.** This is stated plainly because it is the most
important thing to know about this project:

- Anyone may read, create and update **any** player profile.
- Anyone may submit **any** race for **any** player. Lap times are taken at face
  value and are **not** verified. Results are not cheat-proof and never will be
  under the current design.
- A player id in the browser is a *pointer*, not proof of identity. It lives in
  `localStorage` and anyone can read or edit it.

`GET /api/health` reports `persistent: true`, which means the data **survives a
restart** — not that it is **trustworthy**. Those are different claims and only
the first is true.

What *is* enforced: input validation on both sides, `CHECK` constraints and
foreign keys in the database, credentials only in gitignored `.env` files, CORS
restricted to configured origins, and error bodies that never contain SQL, class
names or credentials.

---

## Testing

```powershell
# Frontend: 706 assertions across 12 harnesses
cd frontend
npm test

# Backend: 87 tests against a real MySQL
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
│   └── src/…                   Spring Boot, Flyway, JPA, 87 tests
└── frontend/
    ├── .env.example            VITE_API_BASE_URL template
    ├── src/
    │   ├── services/           api.ts, profile.ts, raceSubmission.ts, backend.ts
    │   ├── hooks/              usePlayerProfile, useReferenceData
    │   ├── game/               Phaser — never imports from services/
    │   └── pages/              React screens
    └── tools/                  12 headless harnesses, 706 assertions
```

Nothing under `src/game/` imports from `src/services/`. Phaser cannot reach the
network, which is what keeps the game playable offline.