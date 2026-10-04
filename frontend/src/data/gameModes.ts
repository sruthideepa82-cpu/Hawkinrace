export type GameModeId = 'quick-race' | 'time-trial' | 'survival' | 'nitro-rush' | 'upside-down';

export interface GameModeInfo {
  id: GameModeId;
  name: string;
  description: string;
  playable: boolean;
}

export const GAME_MODES: readonly GameModeInfo[] = [
  { id: 'quick-race', name: 'QUICK RACE', description: 'Three laps. Best time wins.', playable: true },
  { id: 'time-trial', name: 'TIME TRIAL', description: 'Chase your own ghost.', playable: false },
  { id: 'survival', name: 'SURVIVAL', description: 'Last one running wins.', playable: false },
  { id: 'nitro-rush', name: 'NITRO RUSH', description: 'Boost everywhere.', playable: false },
  { id: 'upside-down', name: 'UPSIDE DOWN', description: 'The world flips.', playable: false },
];
