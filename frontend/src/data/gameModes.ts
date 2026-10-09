export type GameModeId = 'quick-race' | 'time-trial' | 'survival' | 'nitro-rush' | 'upside-down';

export interface GameModeInfo {
  id: GameModeId;
  name: string;
  description: string;
  playable: boolean;
  label?: string;
  imageId: string;
}

export const GAME_MODES: readonly GameModeInfo[] = [
  { id: 'quick-race', name: 'QUICK RACE', description: 'Three laps. No distractions. Take the lead.', playable: true, label: 'RACE NOW', imageId: 'quick_race' },
  { id: 'time-trial', name: 'TIME TRIAL', description: 'Beat the clock. Chase your perfect lap.', playable: false, imageId: 'time_trial' },
  { id: 'survival', name: 'SURVIVAL', description: 'Stay ahead. Survive the chaos.', playable: false, imageId: 'survival' },
  { id: 'nitro-rush', name: 'NITRO RUSH', description: 'Full boost. Maximum intensity.', playable: false, imageId: 'nitro_rush' },
  { id: 'upside-down', name: 'UPSIDE DOWN', description: 'Enter the other side of Hawkins.', playable: false, imageId: 'upside_down' },
];
