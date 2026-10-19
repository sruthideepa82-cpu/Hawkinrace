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

/** Base URL of the Spring Boot API. Override with VITE_API_URL if needed. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

/* -------------------------------------------------------------------------- */
/* Wire types. These mirror the backend DTOs exactly.                          */
/* -------------------------------------------------------------------------- */

/** GET /api/health */
export interface BackendHealth {
  status: string;
  application: string;
  version: string;
  /** "memory" in Phase 4. Data is lost on restart. */
  storage: string;
  /** Always false in Phase 4 -- see the backend README before trusting records. */
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

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True when the backend could not be reached at all. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      // Only attach Content-Type when there is a body to describe. Setting it on
      // a GET forces the browser into a CORS preflight for a request that has
      // nothing to preflight.
      ...(init?.body ? { headers: { 'Content-Type': 'application/json' } } : {}),
      ...init,
    });
  } catch {
    // Network-level failure: the backend is probably not running. Status 0 marks
    // this so callers can tell "offline" apart from "the server said no".
    throw new ApiRequestError(0, `Cannot reach the backend at ${API_BASE_URL}`);
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
  return (await response.json()) as T;
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
 * Worth calling before showing anything about persisted data: `persistent` is
 * false in Phase 4, so the UI should not imply a saved time will survive.
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