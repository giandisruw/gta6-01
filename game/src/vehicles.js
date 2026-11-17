// Vehicles: the models that drive Solmar Bay, traffic that follows the road grid, and the
// arcade car physics the player drives with (accelerate, steer, brake, handbrake, collisions).
import { CAR, ROAD_W, ROADS_X, ROADS_Y, WORLD } from './config.js';
import { angleDiff, clamp, pick, range } from './random.js';

export const CAR_TYPES = {
  sedan: { w: 46, h: 22, max: 520, accel: 1.0, colors: ['#c94f43', '#4a7fa5', '#d8d3c8', '#5f9e7a', '#8a8a92'] },
  taxi: { w: 46, h: 22, max: 540, accel: 1.0, colors: ['#f7c531'] },
  sports: { w: 48, h: 21, max: 660, accel: 1.35, colors: ['#e8b10f', '#c22e5f', '#22b8a0', '#e8e8e8'] },
  van: { w: 54, h: 24, max: 440, accel: 0.8, colors: ['#7a7f8a', '#a5a08a', '#5f7a8a'] },
  truck: { w: 64, h: 26, max: 410, accel: 0.7, colors: ['#8a6a3a', '#6a7a5a'] },
  police: { w: 48, h: 22, max: 640, accel: 1.25, colors: ['#2244aa'] },
  muscle: { w: 50, h: 23, max: 590, accel: 1.15, colors: ['#3a3a3a', '#7a1f1f', '#1f5a3a'] },
};

let nextCarId = 1;

export function makeCar(random, type, x, y, angle) {
  const def = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    x, y, angle,
    speed: 0,
    w: def.w, h: def.h,
    color: pick(random, def.colors),
    driver: 'traffic', // traffic | player | police | none
    hp: CAR.hp,
    lane: random() < 0.5 ? -1 : 1,
    vertical: Math.abs(Math.sin(angle)) < Math.abs(Math.cos(angle)) ? false : true,
    cruise: range(random, 120, 165),
    turnAt: null,
    honk: 0,
    dead: false,
    smoke: 0,
  };
}

/** Spawn a traffic car on a random road, facing along it. */
export function spawnTrafficCar(random, city) {
  const p = city.randomRoadPoint();
  const type = pick(random, ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sports', 'muscle', 'truck']);
  const angle = p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
  const car = makeCar(random, type, p.x, p.y, angle);
  car.vertical = p.vertical;
  return car;
}

/** A parked car at the kerb of a road, free for the player to steal. */
export function spawnParkedCar(random, city) {
  const p = city.randomRoadPoint();
  const type = pick(random, ['sedan', 'sedan', 'sports', 'muscle', 'taxi', 'van']);
  const angle = p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
  const off = (ROAD_W / 2 - 16) * (random() < 0.5 ? -1 : 1);
  const car = makeCar(random, type, p.vertical ? p.x + off : p.x, p.vertical ? p.y : p.y + off, angle);
  car.driver = 'none';
  car.vertical = p.vertical;
  return car;
}

function carAhead(cars, car, look) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = Infinity;
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < look && side < 34 && along < best) best = along;
  }
  return best;
}

/** One traffic step: follow the lane, slow for the car ahead, turn at intersections. */
export function stepTraffic(car, cars, dt, random) {
  if (car.driver !== 'traffic') return;
  const ahead = carAhead(cars, car, 110);
  const target = ahead < 70 ? 0 : car.cruise;
  car.speed += clamp(target - car.speed, -CAR.brake * dt, CAR.accel * 0.55 * dt);
  if (car.speed < 0) car.speed = 0;

  // At an intersection, sometimes turn onto the crossing road.
  const onV = ROADS_X.some((rx) => Math.abs(car.x - rx) < 46);
  const onH = ROADS_Y.some((ry) => Math.abs(car.y - ry) < 46);
  if (onV && onH && car.targetAngle === undefined && random() < 0.012) {
    const vertical = random() < 0.5;
    const dir = random() < 0.5 ? 1 : -1;
    car.vertical = vertical;
    car.targetAngle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  }
  if (car.targetAngle !== undefined) {
    const diff = angleDiff(car.angle, car.targetAngle);
    car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
    if (Math.abs(diff) < 0.05) car.targetAngle = undefined;
  }
  // Stay in lane: gently nudge back to the road centre + lane offset.
  const lane = car.vertical
    ? nearestRoadX(car.x) + car.lane * 30
    : nearestRoadY(car.y) + car.lane * 30;
  const cross = car.vertical ? lane - car.x : lane - car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (car.vertical) car.x += clamp(cross, -60 * dt, 60 * dt);
  else car.y += clamp(cross, -60 * dt, 60 * dt);
  // Wrap around the city edges so traffic never runs out.
  if (car.x < 60) car.x = WORLD.width - 80;
  if (car.x > WORLD.width - 60) car.x = 80;
  if (car.y < 60) car.y = WORLD.height - 80;
  if (car.y > WORLD.height - 60) car.y = 80;
}

function nearestRoadX(x) {
  let best = ROADS_X[0];
  for (const rx of ROADS_X) if (Math.abs(rx - x) < Math.abs(best - x)) best = rx;
  return best;
}
function nearestRoadY(y) {
  let best = ROADS_Y[0];
  for (const ry of ROADS_Y) if (Math.abs(ry - y) < Math.abs(best - y)) best = ry;
  return best;
}

/**
 * Player driving: throttle / brake / reverse / steer with speed-scaled turning, grip that
 * pulls velocity toward the heading, and a handbrake that breaks grip for skids.
 * Returns { skidding } for particles and sound.
 */
export function stepPlayerCar(car, drive, dt) {
  const def = CAR_TYPES[car.type];
  const max = def.max;
  if (drive.up) car.speed += CAR.accel * def.accel * dt;
  if (drive.down) car.speed -= (car.speed > 5 ? CAR.brake : CAR.accel * 0.6) * dt;
  if (!drive.up && !drive.down) car.speed -= Math.sign(car.speed) * 140 * dt;
  if (Math.abs(car.speed) < 4 && !drive.up && !drive.down) car.speed = 0;
  car.speed = clamp(car.speed, -CAR.reverseMax, max);
  const steerAmount = (drive.left ? -1 : 0) + (drive.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  const turnScale = clamp(Math.abs(car.speed) / 240, 0.25, 1);
  car.angle += steerAmount * CAR.turnRate * turnScale * dir * dt * (drive.handbrake ? 1.5 : 1);
  const grip = drive.handbrake ? 1.6 : CAR.grip;
  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.vx = (car.vx ?? vx) + (vx - (car.vx ?? vx)) * Math.min(1, grip * dt);
  car.vy = (car.vy ?? vy) + (vy - (car.vy ?? vy)) * Math.min(1, grip * dt);
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const skidding = drive.handbrake && Math.abs(car.speed) > 200;
  return { skidding };
}

/** Push two overlapping cars apart and dent both; returns the impact speed. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const min = (a.w + b.w) / 2 - 6;
  if (d >= min) return 0;
  const overlap = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const impact = Math.abs((a.speed || 0) - (b.speed || 0));
  a.speed = (a.speed || 0) * 0.6;
  b.speed = (b.speed || 0) * 0.6;
  a.hp -= impact * 0.05;
  b.hp -= impact * 0.05;
  return impact;
}

/** Circle-vs-car test, for the player on foot and for bullets. */
export function carContains(car, x, y, pad) {
  const dx = x - car.x;
  const dy = y - car.y;
  const c = Math.cos(-car.angle);
  const s = Math.sin(-car.angle);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) < car.w / 2 + (pad || 0) && Math.abs(ly) < car.h / 2 + (pad || 0);
}
