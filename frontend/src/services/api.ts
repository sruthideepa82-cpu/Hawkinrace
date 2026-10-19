/**
 * REST client for the Hawkins: Nitro Run backend.
 *
 * This is the only module in the app that talks HTTP. Everything else goes
 * through these functions, so changing transport later touches one file.
 *
 * Two rules keep this client honest:
 *
 * 1. **The race never waits on the network.** Nothing here is called from the
 *    Phaser update loop, and every caller treats failure as non-fatal. The
 *    backend only stores finished results -- the race itself still runs
 *    entirely in Phaser, offline, at 60fps.
 *
 * 2. **Ids are strings, and they are the same strings the game uses.**
 *    `apex-vulcan` and `hawkins-streets` here are literally the ids in
 *    `src/data/cars.ts` and `src/data/tracks.ts`. There is no translation layer
 *    and no matching-on-name, so the API and the game cannot drift apart.
 */

/**
 * Base URL of the Spring Boot API.
 *
 * Configured with `VITE_API_BASE_URL` (see `.env.example`). `VITE_API_URL` is
 * still honoured so an older local `.env` keeps working.
 *
 * Read through {@link readEnv} rather than `import.meta.env` directly: Vite
 * replaces that object at build time, but the headless harnesses in `tools/`
 * run under plain Node where it does not exist. Touching the property directly
 * would throw `Cannot read properties of undefined` the moment a test imported
 * this file.
 *
 * No secret belongs here. Everything VITE_-prefixed is inlined into the bundle
 * and is public; the database is never contacted from the browser.
 */
export function readEnv(): Record<string, string | undefined> {
  try {
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  } catch {
    // No `import.meta` at all (plain Node, or a bundler that stripped it).
    return {};
  }
}

/** Set by tests to point the client at a stub server. `null` restores config. */
let baseUrlOverride: string | null = null;

/** Test seam. Not used by application code. */
export function setApiBaseUrl(url: string | null): void {
  baseUrlOverride = url;
}

function defaultBaseUrl(): string {
  const env = readEnv();
  const configured = env.VITE_API_BASE_URL ?? env.VITE_API_URL ?? 'http://localhost:8080';
  // A trailing slash would produce 'http://host:8080//api/cars'. Harmless to
  // most servers, but worth normalising rather than debugging later.
  return configured.replace(/\/+$/, '');
}

/** The URL every request is built from. */
export function apiBaseUrl(): string {
  return baseUrlOverride ?? defaultBaseUrl();
}

/* -------------------------------------------------------------------------- */
/* Wire types. These mirror the backend DTOs exactly.                          */
/* -------------------------------------------------------------------------- */

/** GET /api/health */
export interface BackendHealth {
  status: string;
  application: string;
  version: string;
  /** "memory" before Phase 5, "mysql" after. */
  storage: string;
  /** True since Phase 5. Says nothing about whether the data is trustworthy. */
  persistent: boolean;
  message: string;
}

/** A car from GET /api/cars. Attributes are on the game's 1-10 scale. */
export interface BackendCar {
  id: string;
  name: string;
  blurb: string | null;
  /** 0xRRGGBB, as the game uses it. */
  color: number;
  speed: number;
  acceleration: number;
  handling: number;
  nitro: number;
  unlocked: boolean;
}

/** A track from GET /api/tracks. `id` matches `src/data/tracks.ts`. */
export interface BackendTrack {
  id: string;
  name: string;
  description: string | null;
  difficulty: string | null;
  weather: string | null;
  environment: string | null;
  laps: number;
  locked: boolean;
}

/** A player profile. */
export interface BackendPlayer {
  id: string;
  displayName: string;
  selectedCarId: string | null;
  createdAt: string;
}

/** Body of POST /api/players. The server assigns `id` and `createdAt`. */
export interface CreatePlayerPayload {
  displayName: string;
  selectedCarId?: string | null;
}

/** Body of PUT /api/players/{id}. */
export interface UpdatePlayerPayload {
  displayName: string;
  selectedCarId?: string | null;
}

/** A stored race record. Times are milliseconds, matching the game's internals. */
export interface RaceRecord {
  id: string;
  playerId: string;
  carId: string;
  trackId: string;
  /** 1-based. */
  position: number;
  lapsCompleted: number;
  elapsedTimeMs: number;
  bestLapTimeMs: number | null;
  completedAt: string;
}

/** Body of POST /api/races. Times are milliseconds. */
export interface RaceSubmission {
  playerId: string;
  carId: string;
  trackId: string;
  elapsedTimeMs: number;
  bestLapTimeMs: number | null;
  position: number;
  lapsCompleted: number;
}

/** Response to POST /api/races. */
export interface RaceSavedResponse {
  id: string;
  message: string;
  race: RaceRecord;
}

/** One leaderboard row. */
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  carId: string;
  trackId: string;
  racesCompleted: number;
  bestTimeMs: number;
  averageTimeMs: number;
  bestPosition: number;
  score: number;
}

/** A page of leaderboard rows. */
export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  sortBy: string;
  sortDirection: string;
}

/** Query options for GET /api/leaderboard. */
export interface LeaderboardQuery {
  /** score (default), bestTimeMs, racesCompleted or bestPosition. */
  sortBy?: string;
  /** asc or desc. Omit for each key's natural direction. */
  order?: string;
  page?: number;
  size?: number;
}

/** The error body every failing endpoint returns. */
export interface ApiErrorBody {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  fieldErrors?: Record<string, string> | null;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

/** Error carrying the HTTP status and the backend's message. */
export class ApiRequestError extends Error {
  readonly status: number;
  /** Per-field validation messages, when the backend supplied them. */
  readonly fieldErrors: Record<string, string>;
  /** The underlying failure, when there was one. Never shown to the player. */
  readonly detail: string | undefined;

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string> = {},
    detail?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.detail = detail;
  }

  /** True when the backend could not be reached at all. */
  get isOffline(): boolean {
    return this.status === 0;
  }

  /**
   * True when the same request could plausibly succeed later.
   *
   * Used to decide whether to offer a RETRY. A 400 is the server rejecting the
   * data itself; retrying it unchanged would fail identically forever, so
   * offering the button would be a lie.
   */
  get isRetryable(): boolean {
    return this.isOffline || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      // Only attach Content-Type when there is a body to describe. Setting it on
      // a GET forces the browser into a CORS preflight for a request that has
      // nothing to preflight.
      ...(init?.body ? { headers: { 'Content-Type': 'application/json' } } : {}),
      ...init,
    });
  } catch (cause) {
    // Network-level failure: the backend is probably not running, or CORS
    // blocked it. Status 0 marks this so callers can tell "offline" apart from
    // "the server said no" -- a distinction the UI has to make, because one is
    // recoverable by retrying and the other usually is not.
    throw new ApiRequestError(
      0,
      `Cannot reach the backend at ${base}`,
      {},
      cause instanceof Error ? cause.message : undefined,
    );
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let fieldErrors: Record<string, string> = {};
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body?.message) message = body.message;
      if (body?.fieldErrors) fieldErrors = body.fieldErrors;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiRequestError(response.status, message, fieldErrors);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // An empty body where JSON was expected is a server bug, not an empty result.
  // Returning undefined here would surface as a TypeError three frames away,
  // which is much harder to trace than failing here with the URL attached.
  const text = await response.text();
  if (!text) {
    throw new ApiRequestError(response.status, `Empty response from ${base}${path}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiRequestError(response.status, `Malformed JSON from ${base}${path}`);
  }
}

/** Builds a query string, dropping anything null/undefined/empty. */
function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Backend status.
 *
 * Worth calling before implying anything about durability. Since Phase 5 the
 * backend is MySQL-backed and reports `persistent: true`.
 *
 * That flag describes *storage*, not *trust*: race records are still submitted
 * by an unauthenticated client and are not verified, so `persistent` must never
 * be read as "these times are real".
 */
export function getHealth(): Promise<BackendHealth> {
  return request<BackendHealth>('/api/health');
}

/* Players ------------------------------------------------------------------ */

export function getPlayers(): Promise<BackendPlayer[]> {
  return request<BackendPlayer[]>('/api/players');
}

export function getPlayer(playerId: string): Promise<BackendPlayer> {
  return request<BackendPlayer>(`/api/players/${encodeURIComponent(playerId)}`);
}

export function createPlayer(payload: CreatePlayerPayload): Promise<BackendPlayer> {
  return request<BackendPlayer>('/api/players', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePlayer(
  playerId: string,
  payload: UpdatePlayerPayload,
): Promise<BackendPlayer> {
  return request<BackendPlayer>(`/api/players/${encodeURIComponent(playerId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** A player's race history, newest first. 404 if the player is unknown. */
export function getPlayerRaces(playerId: string): Promise<RaceRecord[]> {
  return request<RaceRecord[]>(`/api/players/${encodeURIComponent(playerId)}/races`);
}

/* Cars and tracks ---------------------------------------------------------- */

export function getCars(): Promise<BackendCar[]> {
  return request<BackendCar[]>('/api/cars');
}

export function getCar(carId: string): Promise<BackendCar> {
  return request<BackendCar>(`/api/cars/${encodeURIComponent(carId)}`);
}

export function getTracks(): Promise<BackendTrack[]> {
  return request<BackendTrack[]>('/api/tracks');
}

export function getTrack(trackId: string): Promise<BackendTrack> {
  return request<BackendTrack>(`/api/tracks/${encodeURIComponent(trackId)}`);
}

/* Races -------------------------------------------------------------------- */

export function saveRaceResult(submission: RaceSubmission): Promise<RaceSavedResponse> {
  return request<RaceSavedResponse>('/api/races', {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

export function getRace(raceId: string): Promise<RaceRecord> {
  return request<RaceRecord>(`/api/races/${encodeURIComponent(raceId)}`);
}

/* Leaderboard -------------------------------------------------------------- */

export function getLeaderboard(query_?: LeaderboardQuery): Promise<LeaderboardPage> {
  return request<LeaderboardPage>(
    `/api/leaderboard${query({
      sortBy: query_?.sortBy,
      order: query_?.order,
      page: query_?.page,
      size: query_?.size,
    })}`,
  );
}