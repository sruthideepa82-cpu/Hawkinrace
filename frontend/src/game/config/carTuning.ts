import type { CarId } from '../../data/cars';

export interface CarTuning {
  maxSpeed: number;
  acceleration: number;
  brakeForce: number;
  coastFriction: number;
  drag: number;
  maxReverseSpeed: number;
  reverseAcceleration: number;
  steerRate: number;
  lateralGrip: number;
}

export const VEHICLE_CONFIG: Record<CarId, CarTuning> = {
  'falcon-gt': {
    maxSpeed: 600,
    acceleration: 200,      // Smooth, progressive buildup
    brakeForce: 600,        // Strong intentional braking
    coastFriction: 30,      // Gradual slowdown when throttle released
    drag: 0.1,              // Momentum preservation
    maxReverseSpeed: 200,   // ~33% of max speed
    reverseAcceleration: 150,
    steerRate: 3.0,         // Smooth responsive rotation
    lateralGrip: 4.0,       // Subtle slide
  },
  'night-runner': {
    maxSpeed: 550,
    acceleration: 250,      // Quicker acceleration
    brakeForce: 650,
    coastFriction: 35,
    drag: 0.1,
    maxReverseSpeed: 180,
    reverseAcceleration: 150,
    steerRate: 3.5,         // Better handling
    lateralGrip: 5.0,
  },
  'hawk-xr': {
    maxSpeed: 700,          // Higher top speed
    acceleration: 180,      // Needs more space
    brakeForce: 500,        // Weaker brakes
    coastFriction: 25,
    drag: 0.08,
    maxReverseSpeed: 220,
    reverseAcceleration: 150,
    steerRate: 2.2,         // Weaker handling
    lateralGrip: 3.0,       // Slides more
  }
};

export function getCarTuning(id: string): CarTuning {
  return VEHICLE_CONFIG[id as CarId] ?? VEHICLE_CONFIG['falcon-gt'];
}
