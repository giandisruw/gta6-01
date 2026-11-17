// Solmar Bay itself: the road grid, the blocks between the roads, the buildings, parks,
// trees and props inside them, and every collision / road query the rest of the game uses.
// Nothing here draws or moves; it is pure geometry built once from a seeded random.
import { BEACH_X, PALETTE, ROADS_X, ROADS_Y, ROAD_W, WATER_X, WORLD } from './config.js';
import { pick, range } from './random.js';

const BUILDING_NAMES = [
  'Solmar Hotel', 'Bayview Apts', 'Coral Offices', 'Palm Court', 'Harbor Lofts',
  'Sunset Plaza', 'Marina Tower', 'Café Luna', 'Tropicana Mall', 'Seaside Suites',
  'Old Town Hall', 'The Palms', 'Dockside Warehouses', 'Cinema Rex', 'La Bodega',
  'Fitness Club', 'Bookshop', 'Bar El Faro', 'Pizzeria Napoli', 'Laundromat 24h',
];

/** True when the point is on a road surface (within half a road width of a centre-line). */
export function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

/** Nearest road centre-line coordinate on the given axis ('x' or 'y'). */
export function nearestRoadCoord(axis, value) {
  const list = axis === 'x' ? ROADS_X : ROADS_Y;
  let best = list[0];
  for (const v of list) if (Math.abs(v - value) < Math.abs(best - value)) best = v;
  return best;
}

/** Distance to the nearest vertical / horizontal road centre-line. */
export function roadDistance(x, y) {
  let dx = Infinity;
  for (const rx of ROADS_X) dx = Math.min(dx, Math.abs(x - rx));
  let dy = Infinity;
  for (const ry of ROADS_Y) dy = Math.min(dy, Math.abs(y - ry));
  return { dx, dy };
}

export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const props = []; // benches, lamps, hydrants, crates: small circles / rects with a kind
  let nameIndex = 0;

  const xs = [WATER_X + 40, ...ROADS_X, WORLD.width - 40];
  const ys = [40, ...ROADS_Y, WORLD.height - 40];

  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      const x0 = xs[ix] + ROAD_W / 2 + 14;
      const x1 = xs[ix + 1] - ROAD_W / 2 - 14;
      const y0 = ys[iy] + ROAD_W / 2 + 14;
      const y1 = ys[iy + 1] - ROAD_W / 2 - 14;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 90 || h < 90) continue;
      // The beach block stays sand with palms, not buildings.
      if (x0 < BEACH_X) {
        for (let t = 0; t < 6; t += 1) {
          trees.push({ x: range(random, x0 + 10, x1 - 10), y: range(random, y0 + 10, y1 - 10), palm: true, s: range(random, 0.9, 1.3) });
        }
        continue;
      }
      // About one block in five is a park.
      if (random() < 0.2) {
        parks.push({ x: x0, y: y0, w, h });
        const n = 5 + Math.floor(random() * 6);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: range(random, x0 + 12, x1 - 12), y: range(random, y0 + 12, y1 - 12), palm: random() < 0.3, s: range(random, 0.8, 1.3) });
        }
        props.push({ kind: 'bench', x: x0 + w / 2, y: y0 + h / 2 });
        continue;
      }
      // Otherwise 1-3 buildings fill the block, with a little yard around each.
      const count = w > 300 && h > 220 && random() < 0.6 ? 3 : w > 220 && random() < 0.5 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const bw = count === 1 ? w * range(random, 0.55, 0.8) : w / count - 26;
        const bh = count === 1 ? h * range(random, 0.5, 0.75) : h * range(random, 0.55, 0.8);
        const bx = count === 1 ? x0 + (w - bw) / 2 : x0 + (b * w) / count + 13;
        const by = count === 1 ? y0 + (h - bh) / 2 : y0 + (h - bh) / 2;
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          roof: pick(random, PALETTE.buildingRoof),
          height: 14 + Math.floor(random() * 30),
          name: BUILDING_NAMES[nameIndex % BUILDING_NAMES.length],
        });
        nameIndex += 1;
        if (random() < 0.5) trees.push({ x: bx + bw + 18, y: by + 8, palm: random() < 0.5, s: 1 });
      }
      // Street lamps along the block's top edge.
      for (let lx = x0 + 30; lx < x1 - 20; lx += 130) props.push({ kind: 'lamp', x: lx, y: y0 - 8 });
    }
  }

  // Crates and a few parked props around the docks.
  for (let i = 0; i < 10; i += 1) {
    props.push({ kind: 'crate', x: range(random, 3100, 3450), y: range(random, 2050, 2350) });
  }

  /** The building whose rectangle contains (x, y) expanded by r, or null. */
  function buildingAt(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }

  /** Push a circle (x, y, r) out of every building it overlaps; returns the corrected point. */
  function resolveBuildings(x, y, r) {
    let px = x;
    let py = y;
    for (const b of buildings) {
      if (px + r > b.x && px - r < b.x + b.w && py + r > b.y && py - r < b.y + b.h) {
        const pushL = px + r - b.x;
        const pushR = b.x + b.w - (px - r);
        const pushT = py + r - b.y;
        const pushB = b.y + b.h - (py - r);
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) px = b.x - r;
        else if (m === pushR) px = b.x + b.w + r;
        else if (m === pushT) py = b.y - r;
        else py = b.y + b.h + r;
      }
    }
    return { x: px, y: py };
  }

  /** Clamp a point inside the walkable world (water on the west is out of bounds). */
  function clampInside(x, y, r) {
    return {
      x: Math.min(WORLD.width - r, Math.max(WATER_X + r, x)),
      y: Math.min(WORLD.height - r, Math.max(r, y)),
    };
  }

  /** A random point on a road, for spawning traffic and pedestrians. */
  function randomRoadPoint() {
    if (random() < 0.5) {
      const rx = pick(random, ROADS_X);
      return { x: rx + range(random, -ROAD_W / 2 + 18, ROAD_W / 2 - 18), y: range(random, 120, WORLD.height - 120), vertical: true };
    }
    const ry = pick(random, ROADS_Y);
    return { x: range(random, BEACH_X + 60, WORLD.width - 120), y: ry + range(random, -ROAD_W / 2 + 18, ROAD_W / 2 - 18), vertical: false };
  }

  return { buildings, trees, parks, props, buildingAt, resolveBuildings, clampInside, randomRoadPoint };
}
