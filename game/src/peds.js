// Pedestrians: the people of Solmar Bay. They stroll the sidewalks, wait at crossings,
// chat in pairs, and run when a crime happens nearby. A few are taxi customers.
import { BEACH_X, ROAD_W, WORLD } from './config.js';
import { angleTo, clamp, dist, pick, range } from './random.js';

const PED_COLORS = ['#e8b10f', '#4a7fa5', '#c96f4a', '#5f9e7a', '#8a5f9e', '#d8d3c8', '#3a3a3a', '#a54a5f'];
const PED_NAMES = ['Ana', 'Luis', 'Carmen', 'Diego', 'Sofia', 'Marco', 'Elena', 'Pablo', 'Lucia', 'Jorge', 'Nina', 'Rosa'];

export function makePed(random, city) {
  const p = city.randomRoadPoint();
  // Stand on the sidewalk beside the road, not in the middle of it.
  const side = random() < 0.5 ? -1 : 1;
  const x = p.vertical ? p.x + side * (ROAD_W / 2 + 14) : p.x;
  const y = p.vertical ? p.y : p.y + side * (ROAD_W / 2 + 14);
  return {
    x: Math.max(BEACH_X + 10, x), y: clamp(y, 30, WORLD.height - 30),
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 45, 75),
    color: pick(random, PED_COLORS),
    name: pick(random, PED_NAMES),
    state: 'walk', // walk | flee | wait | taxi
    tx: 0, ty: 0, wait: 0,
    panic: 0,
    seed: random(),
  };
}

/** Pick a new sidewalk stroll target near the ped. */
function retarget(ped, random, city) {
  const p = city.randomRoadPoint();
  const side = random() < 0.5 ? -1 : 1;
  ped.tx = p.vertical ? p.x + side * (ROAD_W / 2 + 14) : p.x;
  ped.ty = p.vertical ? p.y : p.y + side * (ROAD_W / 2 + 14);
  ped.tx = clamp(ped.tx, BEACH_X + 10, WORLD.width - 30);
  ped.ty = clamp(ped.ty, 30, WORLD.height - 30);
}

export function stepPeds(peds, dt, random, city, danger) {
  for (const ped of peds) {
    if (ped.state === 'taxi') continue;
    const d = danger ? dist(ped.x, ped.y, danger.x, danger.y) : Infinity;
    if (d < 320) {
      ped.state = 'flee';
      ped.panic = 1.2;
    }
    if (ped.state === 'flee') {
      ped.panic -= dt;
      const away = angleTo(danger.x, danger.y, ped.x, ped.y);
      ped.angle = away;
      ped.x += Math.cos(away) * 190 * dt;
      ped.y += Math.sin(away) * 190 * dt;
      if (ped.panic <= 0) ped.state = 'walk';
      const fixed = city.resolveBuildings(ped.x, ped.y, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
      ped.x = clamp(ped.x, BEACH_X + 10, WORLD.width - 30);
      ped.y = clamp(ped.y, 30, WORLD.height - 30);
      continue;
    }
    if (ped.wait > 0) {
      ped.wait -= dt;
      continue;
    }
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const dd = Math.hypot(dx, dy);
    if (dd < 12 || (ped.tx === 0 && ped.ty === 0)) {
      if (random() < 0.3) { ped.wait = range(random, 1, 4); }
      else retarget(ped, random, city);
      continue;
    }
    ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    // Strolling in a straight line can cut a block corner: slide around buildings.
    const fixed = city.resolveBuildings(ped.x, ped.y, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
  }
}
