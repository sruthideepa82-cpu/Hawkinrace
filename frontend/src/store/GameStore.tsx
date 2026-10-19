import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { CARS, type Car, type CarId } from '../data/cars';
import { CHARACTERS, type Character, type CharacterId } from '../data/characters';
import { GAME_MODES, type GameModeId, type GameModeInfo } from '../data/gameModes';
import { DIFFICULTIES, type DifficultyId } from '../game/config/difficulty';
import { TRACKS, type TrackId, type TrackInfo } from '../data/tracks';
import type { RaceResult } from '../game/bridge';

/**
 * Progression state only.
 *
 * Which page is on screen is NOT stored here -- that is the URL, read by the
 * router. Holding a second copy of it here was what let the two disagree.
 *
 *  raceKey   bumped on every race start. The Phaser game is rebuilt from the
 *            bridge that RacePage memoises on it, which is what makes RETRY
 *            start a genuinely new race.
 *  lastResult kept until the next race starts, because the results screen
 *            reads from it rather than being handed values.
 */
/**
 * How the last finished race went with the backend.
 *
 * Kept in the store rather than component state because the result is submitted
 * from `RacePage` and displayed on `ResultsPage`, which are the same mounted
 * instance behind two routes. Local state would die with whichever half the
 * player happened to be looking at.
 */
export type RaceSaveStatus = 'idle' | 'saving' | 'saved' | 'skipped' | 'error';

export interface RaceSaveState {
  status: RaceSaveStatus;
  /** Set only when the backend has confirmed the row exists. */
  raceId: string | null;
  error: string | null;
  /** False for a 400, which would fail identically on every retry. */
  retryable: boolean;
  /** Why a result was never sent, when it was refused locally. */
  skippedReason: string | null;
}

export const idleSaveState: RaceSaveState = {
  status: 'idle',
  raceId: null,
  error: null,
  retryable: false,
  skippedReason: null,
};

export interface GameState {
  selectedCharacterId: CharacterId | null;
  selectedCarId: CarId | null;
  selectedTrackId: TrackId | null;
  selectedGameModeId: GameModeId | null;
  /** AI difficulty for Quick Race. Time Trial ignores it -- it has no AI. */
  selectedDifficultyId: DifficultyId;
  /** Bumped on every race start so the Phaser game is rebuilt. */
  raceKey: number;
  lastResult: RaceResult | null;
  /** State of the last submission to the backend. */
  raceSave: RaceSaveState;
  /**
   * Bumped when a race is confirmed saved.
   *
   * The leaderboard listens for this and refetches. Without it the board still
   * shows whatever was there when the page first loaded, so a player's own new
   * time would not appear until a manual refresh -- which reads as "my race
   * wasn't saved" even when it was.
   */
  leaderboardVersion: number;
}

export type GameAction =
  | { type: 'SELECT_CHARACTER'; id: CharacterId }
  | { type: 'SELECT_CAR'; id: CarId }
  | { type: 'SELECT_TRACK'; id: TrackId }
  | { type: 'SELECT_GAME_MODE'; id: GameModeId }
  | { type: 'SELECT_DIFFICULTY'; id: DifficultyId }
  | { type: 'START_RACE' }
  | { type: 'RACE_FINISHED'; result: RaceResult }
  | { type: 'RACE_SAVE_STARTED' }
  | { type: 'RACE_SAVE_SUCCEEDED'; raceId: string }
  | { type: 'RACE_SAVE_FAILED'; message: string; retryable: boolean }
  | { type: 'RACE_SAVE_SKIPPED'; reason: string }
  | { type: 'RACE_SAVE_RESET' };

export const initialState: GameState = {
  selectedCharacterId: null,
  selectedCarId: null,
  selectedTrackId: null,
  selectedGameModeId: null,
  selectedDifficultyId: 'normal',
  raceKey: 0,
  lastResult: null,
  raceSave: idleSaveState,
  leaderboardVersion: 0,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_CHARACTER':
      return { ...state, selectedCharacterId: action.id };
    case 'SELECT_CAR':
      return CARS.find((c) => c.id === action.id)?.unlocked ? { ...state, selectedCarId: action.id } : state;
    case 'SELECT_TRACK':
      return TRACKS.find((t) => t.id === action.id)?.playable ? { ...state, selectedTrackId: action.id } : state;
    case 'SELECT_GAME_MODE':
      return GAME_MODES.find((m) => m.id === action.id)?.playable ? { ...state, selectedGameModeId: action.id } : state;
    case 'SELECT_DIFFICULTY':
      // Guarded against an unknown id: the table is the authority, so a stale
      // or hand-written action cannot leave a race with no difficulty at all.
      return DIFFICULTIES[action.id] ? { ...state, selectedDifficultyId: action.id } : state;
    // Rebuilds the Phaser game via the new raceKey and clears the old result.
    // The save state resets with it, so a new race never inherits the previous
    // race's "SAVED" badge.
    case 'START_RACE':
      return { ...state, raceKey: state.raceKey + 1, lastResult: null, raceSave: idleSaveState };
    case 'RACE_FINISHED':
      return { ...state, lastResult: action.result };

    // The three save outcomes are deliberately distinct. `saved` is only ever
    // set from a backend confirmation, so the UI can never imply a race was
    // stored when it was not.
    case 'RACE_SAVE_STARTED':
      return { ...state, raceSave: { ...idleSaveState, status: 'saving' } };
    case 'RACE_SAVE_SUCCEEDED':
      return {
        ...state,
        raceSave: { ...idleSaveState, status: 'saved', raceId: action.raceId },
        leaderboardVersion: state.leaderboardVersion + 1,
      };
    case 'RACE_SAVE_FAILED':
      return {
        ...state,
        raceSave: { ...idleSaveState, status: 'error', error: action.message, retryable: action.retryable },
      };
    case 'RACE_SAVE_SKIPPED':
      return {
        ...state,
        raceSave: { ...idleSaveState, status: 'skipped', skippedReason: action.reason },
      };
    case 'RACE_SAVE_RESET':
      return { ...state, raceSave: idleSaveState };
  }
}

export interface Selections {
  character: Character | null;
  car: Car | null;
  track: TrackInfo | null;
  mode: GameModeInfo | null;
}

/** The four things that have to be chosen before a race can start. */
export function getSelections(state: GameState): Selections {
  return {
    character: CHARACTERS.find((c) => c.id === state.selectedCharacterId) ?? null,
    car: CARS.find((c) => c.id === state.selectedCarId) ?? null,
    track: TRACKS.find((t) => t.id === state.selectedTrackId) ?? null,
    mode: GAME_MODES.find((m) => m.id === state.selectedGameModeId) ?? null,
  };
}

/** True when every selection needed to race has been made. */
export function isRaceReady(state: GameState): boolean {
  const { character, car, track, mode } = getSelections(state);
  return Boolean(character && car && track && mode);
}

interface StoreValue {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  selections: Selections;
}

const GameStoreContext = createContext<StoreValue | null>(null);

export function GameStoreProvider({ children, initial = initialState }: { children: ReactNode; initial?: GameState }) {
  const [state, dispatch] = useReducer(gameReducer, initial);
  const value = useMemo<StoreValue>(() => ({ state, dispatch, selections: getSelections(state) }), [state]);
  return <GameStoreContext.Provider value={value}>{children}</GameStoreContext.Provider>;
}

export function useGameStore(): StoreValue {
  const ctx = useContext(GameStoreContext);
  if (!ctx) throw new Error('useGameStore must be used inside <GameStoreProvider>');
  return ctx;
}