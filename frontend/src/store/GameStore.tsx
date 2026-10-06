import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { CARS, type Car, type CarId } from '../data/cars';
import { CHARACTERS, type Character, type CharacterId } from '../data/characters';
import { GAME_MODES, type GameModeId, type GameModeInfo } from '../data/gameModes';
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
export interface GameState {
  selectedCharacterId: CharacterId | null;
  selectedCarId: CarId | null;
  selectedTrackId: TrackId | null;
  selectedGameModeId: GameModeId | null;
  /** Bumped on every race start so the Phaser game is rebuilt. */
  raceKey: number;
  lastResult: RaceResult | null;
}

export type GameAction =
  | { type: 'SELECT_CHARACTER'; id: CharacterId }
  | { type: 'SELECT_CAR'; id: CarId }
  | { type: 'SELECT_TRACK'; id: TrackId }
  | { type: 'SELECT_GAME_MODE'; id: GameModeId }
  | { type: 'START_RACE' }
  | { type: 'RACE_FINISHED'; result: RaceResult };

export const initialState: GameState = {
  selectedCharacterId: null,
  selectedCarId: null,
  selectedTrackId: null,
  selectedGameModeId: null,
  raceKey: 0,
  lastResult: null,
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
    // Rebuilds the Phaser game via the new raceKey and clears the old result.
    case 'START_RACE':
      return { ...state, raceKey: state.raceKey + 1, lastResult: null };
    case 'RACE_FINISHED':
      return { ...state, lastResult: action.result };
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