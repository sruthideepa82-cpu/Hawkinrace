import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { CARS, type Car, type CarId } from '../data/cars';
import { CHARACTERS, type Character, type CharacterId } from '../data/characters';
import { GAME_MODES, type GameModeId, type GameModeInfo } from '../data/gameModes';
import { TRACKS, type TrackId, type TrackInfo } from '../data/tracks';
import type { RaceResult } from '../game/bridge';

export type Screen =
  | 'intro' | 'menu' | 'garage' | 'leaderboard' | 'settings'
  | 'character' | 'car' | 'track' | 'mode' | 'race' | 'results';

export interface GameState {
  screen: Screen;
  selectedCharacterId: CharacterId | null;
  selectedCarId: CarId | null;
  selectedTrackId: TrackId | null;
  selectedGameModeId: GameModeId | null;
  /** Bumped on every race start so the Phaser game is rebuilt. */
  raceKey: number;
  lastResult: RaceResult | null;
}

export type GameAction =
  | { type: 'NAVIGATE'; screen: Screen }
  | { type: 'SELECT_CHARACTER'; id: CharacterId }
  | { type: 'SELECT_CAR'; id: CarId }
  | { type: 'SELECT_TRACK'; id: TrackId }
  | { type: 'SELECT_GAME_MODE'; id: GameModeId }
  | { type: 'START_RACE' }
  | { type: 'RACE_FINISHED'; result: RaceResult };

export const initialState: GameState = {
  screen: 'intro',
  selectedCharacterId: null,
  selectedCarId: null,
  selectedTrackId: null,
  selectedGameModeId: null,
  raceKey: 0,
  lastResult: null,
};

/** Where "< BACK" goes from each screen. */
export const BACK_TARGET: Partial<Record<Screen, Screen>> = {
  garage: 'menu',
  leaderboard: 'menu',
  settings: 'menu',
  character: 'menu',
  car: 'character',
  track: 'car',
  mode: 'track',
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, screen: action.screen };
    case 'SELECT_CHARACTER':
      return { ...state, selectedCharacterId: action.id };
    case 'SELECT_CAR':
      return CARS.find((c) => c.id === action.id)?.unlocked ? { ...state, selectedCarId: action.id } : state;
    case 'SELECT_TRACK':
      return TRACKS.find((t) => t.id === action.id)?.playable ? { ...state, selectedTrackId: action.id } : state;
    case 'SELECT_GAME_MODE':
      return GAME_MODES.find((m) => m.id === action.id)?.playable ? { ...state, selectedGameModeId: action.id } : state;
    case 'START_RACE':
      return { ...state, screen: 'race', raceKey: state.raceKey + 1, lastResult: null };
    case 'RACE_FINISHED':
      return { ...state, screen: 'results', lastResult: action.result };
  }
}

export interface Selections {
  character: Character | null;
  car: Car | null;
  track: TrackInfo | null;
  mode: GameModeInfo | null;
}

export function getSelections(state: GameState): Selections {
  return {
    character: CHARACTERS.find((c) => c.id === state.selectedCharacterId) ?? null,
    car: CARS.find((c) => c.id === state.selectedCarId) ?? null,
    track: TRACKS.find((t) => t.id === state.selectedTrackId) ?? null,
    mode: GAME_MODES.find((m) => m.id === state.selectedGameModeId) ?? null,
  };
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
