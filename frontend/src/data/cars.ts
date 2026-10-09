export type CarId = 'apex-vulcan' | 'venom-verde' | 'shadow-gt' | 'inferno-rs';

export interface CarStats {
  speed: number;
  acceleration: number;
  handling: number;
  nitro: number;
}

export interface Car {
  id: CarId;
  name: string;
  blurb: string;
  /** Paint colour, 0xRRGGBB (also used by the Phaser sprite). */
  color: number;
  unlocked: boolean;
  stats: CarStats;
}

export const CARS: readonly Car[] = [
  { id: 'apex-vulcan', name: 'APEX VULCAN', blurb: 'Metallic orange supercar with aggressive aerodynamics.', color: 0xff8c00, unlocked: true, stats: { speed: 8, acceleration: 7, handling: 6, nitro: 6 } },
  { id: 'venom-verde', name: 'VENOM VERDE', blurb: 'Neon-green exotic car with sharp handling.', color: 0x39ff14, unlocked: true, stats: { speed: 7, acceleration: 8, handling: 8, nitro: 5 } },
  { id: 'shadow-gt', name: 'SHADOW GT', blurb: 'Deep navy-blue performance car built for the track.', color: 0x000080, unlocked: true, stats: { speed: 8, acceleration: 6, handling: 7, nitro: 7 } },
  { id: 'inferno-rs', name: 'INFERNO RS', blurb: 'Glossy red supercar pushing raw speed.', color: 0xff0000, unlocked: true, stats: { speed: 9, acceleration: 7, handling: 5, nitro: 8 } },
];

export const colorToCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
