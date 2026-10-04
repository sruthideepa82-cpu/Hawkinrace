export type CarId = 'falcon-gt' | 'night-runner' | 'hawk-xr';

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
  { id: 'falcon-gt', name: 'FALCON GT', blurb: 'Well-rounded neon coupe.', color: 0xff2e63, unlocked: true, stats: { speed: 7, acceleration: 6, handling: 6, nitro: 5 } },
  { id: 'night-runner', name: 'NIGHT RUNNER', blurb: 'Quick off the line, loves corners.', color: 0x9b5cff, unlocked: true, stats: { speed: 6, acceleration: 8, handling: 8, nitro: 4 } },
  { id: 'hawk-xr', name: 'HAWK XR', blurb: 'Top speed monster, needs space.', color: 0xffb02e, unlocked: true, stats: { speed: 9, acceleration: 5, handling: 5, nitro: 7 } },
];

export const colorToCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
