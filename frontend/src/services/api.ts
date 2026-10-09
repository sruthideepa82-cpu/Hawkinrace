/**
 * REST client for the Hawkins: Nitro Run backend.
 *
 * This is the only module that talks HTTP. Everything else in the app uses
 * these functions, so swapping fetch for another transport later touches one
 * file. The backend only stores completed results -- the race itself still
 * runs entirely in Phaser.
 */

/** Base URL of the Spring Boot API. Override with VITE_API_URL if needed. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export interface BackendPlayer {
  id: number;
  username: string;
  createdAt: string;
}

export interface BackendCar {
  id: number;
  name: string;
  speed: number;
  acceleration: number;
  handling: number;
  nitro: number;
  color: number;
  blurb: string | null;
  unlocked: boolean;
}

export interface BackendTrack {
  id: number;
  name: string;
  description: string | null;
  difficulty: string | null;
  weather: string | null;
  environment: string | null;
  laps: number;
  locked: boolean;
  bestTimeMs: number | null;
}

/** Body of POST /api/races. Times are in seconds. */
export interface RaceSubmission {
  playerId: number;
  carId: number;
  trackId: number;
  totalTime: number;
  bestLapTime: number | null;
  position: number;
  lapsCompleted: number;
}

export interface RaceSavedResponse {
  id: number;
  message: string;
}

export interface LeaderboardEntry {
  position: number;
  playerId: number;
  username: string;
  carName: string;
  totalTime: number;
  bestLapTime: number | null;
  createdAt: string;
}

/** Error carrying the HTTP status and the backend's message. */
export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // Network-level failure: the backend is probably not running.
    throw new ApiRequestError(0, `Cannot reach the backend at ${API_BASE_URL}`);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiRequestError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function getPlayers(): Promise<BackendPlayer[]> {
  return request<BackendPlayer[]>('/api/players');
}

export function getCars(): Promise<BackendCar[]> {
  return request<BackendCar[]>('/api/cars');
}

export function getTracks(): Promise<BackendTrack[]> {
  return request<BackendTrack[]>('/api/tracks');
}

export function saveRaceResult(submission: RaceSubmission): Promise<RaceSavedResponse> {
  return request<RaceSavedResponse>('/api/races', {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

export function getLeaderboard(trackId: number): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(`/api/leaderboard/${trackId}`);
}
