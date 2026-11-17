// Drawing only: the world's state and the current screen in, pixels out. A smooth camera
// follows the player through Solmar Bay; buildings get a sun-side shadow and a roof so the
// flat top-down map reads as a 2.5D city. The HUD carries cash, health, ammo, wanted stars,
// the mission objective and a live minimap. No assets: every shape is drawn, every sound
// is synthesized elsewhere.
import { BEACH_X, FONT, PALETTE, PLACES, ROAD_W, ROADS_X, ROADS_Y, WATER_X, WORLD } from './config.js';
import { clamp } from './random.js';
import { CAR_TYPES } from './vehicles.js';
import { currentMission, currentStage, missionObjective, stageTarget, taxiTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const VIEW_W = 1280;
const VIEW_H = 720;

function star(cx, cy, r, color, ctx) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  const fonts = new Map();
  let viewW = VIEW_W;
  let viewH = VIEW_H;

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
  }

  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Convert screen pixels to world coordinates through the camera. */
  function screenToWorld(sx, sy) {
    return {
      x: camera.x + (sx - viewW / 2) / camera.zoom,
      y: camera.y + (sy - viewH / 2) / camera.zoom,
    };
  }

  function drawGround(city) {
    // Base: grass, then the beach and the sea on the west edge.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, 0, BEACH_X, WORLD.height);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, 0, WATER_X, WORLD.height);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let y = 0; y < WORLD.height; y += 90) {
      ctx.fillRect(12, y + 20, 60, 6);
      ctx.fillRect(40, y + 55, 44, 5);
    }
    // Parks.
    for (const park of city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks: a pale frame around every road.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2 - 14, 0, ROAD_W + 28, WORLD.height);
    for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2 - 14, WORLD.width, ROAD_W + 28);
    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of ROADS_X) {
      for (let y = 0; y < WORLD.height; y += 64) ctx.fillRect(rx - 3, y, 6, 30);
    }
    for (const ry of ROADS_Y) {
      for (let x = 0; x < WORLD.width; x += 64) ctx.fillRect(x, ry - 3, 30, 6);
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        for (let i = -2; i <= 2; i += 1) ctx.fillRect(rx + i * 16 - 5, ry - ROAD_W / 2 + 8, 10, 18);
      }
    }
  }

  function drawBuildings(city) {
    for (const b of city.buildings) {
      // Sun shadow to the south-east, then the walls, then the roof.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 10, b.y + b.height * 0.5 + 8, b.w, b.h);
      ctx.fillStyle = PALETTE.buildingWall;
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Roof details: a lighter inner rectangle and a vent.
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
    }
    for (const prop of city.props) {
      if (prop.kind === 'lamp') {
        ctx.fillStyle = '#2c3038';
        ctx.fillRect(prop.x - 2, prop.y - 2, 4, 14);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y - 4, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (prop.kind === 'bench') {
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(prop.x - 16, prop.y - 6, 32, 12);
      } else if (prop.kind === 'crate') {
        ctx.fillStyle = '#a5803a';
        ctx.fillRect(prop.x - 10, prop.y - 10, 20, 20);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.strokeRect(prop.x - 10, prop.y - 10, 20, 20);
      }
    }
    for (const t of city.trees) {
      const s = t.s;
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(t.x - 2 * s, t.y - 2 * s, 4 * s, 10 * s);
      ctx.fillStyle = t.palm ? PALETTE.treeLight : PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 6 * s, 13 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(t.x - 4 * s, t.y - 10 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCar(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow and body.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-car.w / 2 + 4, -car.h / 2 + 5, car.w, car.h, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 8);
    ctx.fill();
    // Windows and roof.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    roundRect(-car.w * 0.18, -car.h / 2 + 3, car.w * 0.32, car.h - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-car.w * 0.32, -car.h / 2 + 4, 6, car.h - 8);
    // Headlights and tail lights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(car.w / 2 - 3, -car.h / 2 + 3, 3, 5);
    ctx.fillRect(car.w / 2 - 3, car.h / 2 - 8, 3, 5);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(-car.w / 2, -car.h / 2 + 3, 3, 5);
    ctx.fillRect(-car.w / 2, car.h / 2 - 8, 3, 5);
    // Wheels.
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(-car.w / 2 + 6, -car.h / 2 - 3, 12, 5);
    ctx.fillRect(-car.w / 2 + 6, car.h / 2 - 2, 12, 5);
    ctx.fillRect(car.w / 2 - 18, -car.h / 2 - 3, 12, 5);
    ctx.fillRect(car.w / 2 - 18, car.h / 2 - 2, 12, 5);
    if (car.type === 'police') {
      const on = Math.floor((car.siren || 0) * 4) % 2 === 0;
      ctx.fillStyle = on ? '#ff3b30' : '#2b6cff';
      ctx.beginPath();
      ctx.arc(0, -car.h / 2 + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? '#2b6cff' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(0, car.h / 2 - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#1d2733';
      text('TAXI', 0, 4, 9, '#1d2733', 'center', true);
    }
    ctx.restore();
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(car.x, car.y, Math.max(car.w, car.h) * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (car.hp < 50 && !car.dead) {
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(car.x - 8, car.y - 8, 6 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(ped, state) {
    const bob = Math.sin(state.time * 6 + ped.seed * 20) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ped.x, ped.y + 8, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y + bob * 0.3, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 + bob * 0.3, 6, 0, Math.PI * 2);
    ctx.fill();
    if (ped.state === 'flee') {
      text('!', ped.x, ped.y - 18, 16, '#ff5a3c', 'center', true);
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0;
    if (blink) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Mara: red jacket, blonde hair, pistol in hand.
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7d774';
    ctx.beginPath();
    ctx.arc(-3, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(10, -3, 12, 5);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,210,63,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMarker(state) {
    const stage = currentStage(state.missions);
    let target = stage ? stageTarget(stage) : null;
    if (!target && state.missions.taxi) target = taxiTarget(state.missions);
    if (!target) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 52);
    ctx.lineTo(target.x - 10, target.y - 30);
    ctx.lineTo(target.x + 10, target.y - 30);
    ctx.closePath();
    ctx.fill();
    text(target.name || '', target.x, target.y - 60, 15, PALETTE.gold, 'center', true);
  }

  function drawWorld(state) {
    const city = state.city;
    const vx0 = camera.x - viewW / 2 / camera.zoom - 80;
    const vy0 = camera.y - viewH / 2 / camera.zoom - 80;
    const vx1 = camera.x + viewW / 2 / camera.zoom + 80;
    const vy1 = camera.y + viewH / 2 / camera.zoom + 80;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewW, viewH);
    ctx.clip();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    drawGround(city);
    drawBuildings(city);
    // Cash stashes and ammo crates.
    for (const s of state.missions.stashes) {
      if (s.taken) continue;
      ctx.fillStyle = PALETTE.green;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
      text('$', s.x, s.y + 5, 13, '#fff', 'center', true);
    }
    for (const b of state.ammoBoxes) {
      if (b.taken) continue;
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(b.x - 10, b.y - 8, 20, 16);
      ctx.fillStyle = '#ffd23f';
      text('AMMO', b.x, b.y + 4, 8, '#ffd23f', 'center', true);
    }
    // Taxi customer waits with a marker.
    if (state.missions.taxi && state.missions.taxi.state === 'pickup') {
      const t = state.missions.taxi.pickup;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
      ctx.fill();
      text('TAXI', t.x, t.y - 18, 13, PALETTE.gold, 'center', true);
    }
    drawMarker(state);
    for (const ped of state.peds) {
      if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPed(ped, state);
    }
    for (const g of state.combat.gang) {
      if (!g.alive) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 10, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a1f8a';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(g.x - 14, g.y - 24, 28 * Math.max(0, g.hp / 60), 4);
    }
    for (const car of state.cars) {
      if (car.dead) continue;
      if (car.x < vx0 || car.x > vx1 || car.y < vy0 || car.y > vy1) continue;
      drawCar(car, state.player.inCar && car.id === state.player.carId);
    }
    // Foot cops.
    for (const cop of state.police.cops) {
      if (cop.kind !== 'foot') continue;
      ctx.fillStyle = '#2244aa';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cop.x - 7, cop.y - 3, 14, 4);
    }
    // Bullets and particles.
    ctx.fillStyle = '#ffe9a8';
    for (const b of state.combat.bullets) {
      ctx.fillRect(b.x - 3, b.y - 2, 7, 4);
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (state.combat.muzzle > 0 && !state.player.inCar) {
      ctx.fillStyle = '#ffdf6b';
      ctx.beginPath();
      ctx.arc(state.player.x + Math.cos(state.player.angle) * 26, state.player.y + Math.sin(state.player.angle) * 26, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    drawPlayer(state);
    ctx.restore();
    // Warm golden-hour wash over everything.
    ctx.fillStyle = 'rgba(255, 170, 60, 0.07)';
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawMinimap(state) {
    const mw = 220;
    const mh = 132;
    const mx = viewW - mw - 16;
    const my = viewH - mh - 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = PALETTE.panel;
    roundRect(mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(mx, my, mw, mh, 6);
    ctx.clip();
    ctx.fillStyle = '#5d8f43';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#3f8fc4';
    ctx.fillRect(mx, my, (WATER_X / WORLD.width) * mw, mh);
    ctx.fillStyle = '#3a3f47';
    for (const rx of ROADS_X) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
    for (const ry of ROADS_Y) ctx.fillRect(mx, my + ry * sy, mw, 4);
    // Objective marker.
    const stage = currentStage(state.missions);
    let target = stage ? stageTarget(stage) : null;
    if (!target && state.missions.taxi) target = taxiTarget(state.missions);
    if (target) {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(mx + target.x * sx, my + target.y * sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#4d7dff';
    for (const cop of state.police.cops) {
      ctx.beginPath();
      ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = mx + state.player.x * sx;
    const py = my + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('SOLMAR BAY', mx + mw / 2, my - 12 + 6, 11, PALETTE.muted, 'center', true);
  }

  function drawHud(state, screen) {
    const p = state.player;
    // Top-left: cash, health, ammo.
    ctx.fillStyle = PALETTE.panel;
    roundRect(14, 12, 250, 92, 10);
    ctx.fill();
    text(`$${state.cash.toLocaleString('en-US')}`, 28, 44, 28, PALETTE.gold, 'left', true);
    ctx.fillStyle = '#3a3f47';
    roundRect(28, 56, 180, 12, 6);
    ctx.fill();
    ctx.fillStyle = state.health > 30 ? PALETTE.green : PALETTE.red;
    roundRect(28, 56, 180 * Math.max(0, state.health / 100), 12, 6);
    ctx.fill();
    text(`AMMO ${state.ammo}`, 28, 92, 15, PALETTE.text, 'left', true);
    text(`Missions ${state.stats.missionsDone}/6`, 170, 92, 15, PALETTE.muted, 'left');
    // Top-right: wanted stars.
    ctx.fillStyle = PALETTE.panel;
    roundRect(viewW - 214, 12, 200, 52, 10);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      star(viewW - 188 + i * 36, 38, 13, i < state.police.wanted ? '#ffd23f' : 'rgba(255,255,255,0.22)', ctx);
    }
    // Bottom-centre: mission objective.
    const objective = missionObjective(state.missions);
    const stage = currentStage(state.missions);
    ctx.font = font(17, true);
    const ow = Math.min(viewW - 320, ctx.measureText(objective).width + 36);
    ctx.fillStyle = PALETTE.panel;
    roundRect((viewW - ow) / 2, viewH - 108, ow, 40, 10);
    ctx.fill();
    text(objective, viewW / 2, viewH - 81, 17, PALETTE.text, 'center', true);
    if (stage && stage.timer && state.missions.timer > 0) {
      text(`${Math.ceil(state.missions.timer)}s`, viewW / 2, viewH - 52, 22, '#ff8a5c', 'center', true);
    }
    if (stage && stage.hold && state.missions.holdProgress > 0) {
      ctx.fillStyle = '#3a3f47';
      roundRect((viewW - 200) / 2, viewH - 48, 200, 10, 5);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      roundRect((viewW - 200) / 2, viewH - 48, 200 * (state.missions.holdProgress / stage.hold), 10, 5);
      ctx.fill();
    }
    // Speed when driving.
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.carId);
      if (car) {
        text(`${Math.round(Math.abs(car.speed) * 0.36)} km/h`, viewW - 240, viewH - 176, 26, PALETTE.text, 'right', true);
        ctx.fillStyle = '#3a3f47';
        roundRect(viewW - 240, viewH - 164, 200, 8, 4);
        ctx.fill();
        ctx.fillStyle = car.hp > 30 ? PALETTE.gold : PALETTE.red;
        roundRect(viewW - 240, viewH - 164, 200 * Math.max(0, car.hp / 100), 8, 4);
        ctx.fill();
        text('CAR', viewW - 240, viewH - 190, 12, PALETTE.muted, 'right');
      }
    }
    // Clock.
    const hours = Math.floor(state.time / 3600) % 24;
    const mins = Math.floor((state.time % 3600) / 60);
    text(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`, viewW - 28, viewH - 176, 18, PALETTE.text, 'right', true);
    // Controls hint.
    text('WASD move · Mouse aim · Click shoot · E enter car / interact · Shift sprint · Space handbrake · P pause · M mute · Q save', viewW / 2, viewH - 14, 13, 'rgba(255,246,224,0.75)', 'center');
    // Messages feed.
    let my = 120;
    for (const m of state.messages) {
      ctx.globalAlpha = Math.min(1, m.t);
      text(m.text, 28, my, 16, PALETTE.text, 'left');
      ctx.globalAlpha = 1;
      my += 24;
    }
    // Mission banner.
    if (state.banner) {
      ctx.globalAlpha = Math.min(1, state.banner.t);
      ctx.fillStyle = PALETTE.panel;
      const bw = 560;
      roundRect((viewW - bw) / 2, 120, bw, 96, 12);
      ctx.fill();
      text(state.banner.title, viewW / 2, 158, 28, PALETTE.gold, 'center', true);
      ctx.font = font(16);
      const wrapped = wrapText(state.banner.text, 520);
      wrapped.forEach((line, i) => text(line, viewW / 2, 186 + i * 22, 16, PALETTE.text, 'center'));
      ctx.globalAlpha = 1;
    }
    // Damage flash.
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(229, 72, 77, ${state.flash * 0.45})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    drawMinimap(state);
  }

  function wrapText(value, maxWidth) {
    const words = value.split(' ');
    const lines = [''];
    for (const w of words) {
      const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && lines[lines.length - 1]) lines.push(w);
      else lines[lines.length - 1] = test;
    }
    return lines.slice(0, 3);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const h = 150 + lines.length * 30 + 60;
    const x = (viewW - w) / 2;
    const y = (viewH - h) / 2;
    ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 16);
    ctx.stroke();
    text(title, viewW / 2, y + 62, 40, accent || PALETTE.gold, 'center', true);
    lines.forEach((line, i) => text(line, viewW / 2, y + 108 + i * 30, 18, PALETTE.text, 'center'));
    text(prompt, viewW / 2, y + h - 26, 17, PALETTE.muted, 'center');
  }

  function drawTitle(state, best) {
    drawWorld(state);
    // Sun-soaked gradient and big logo over the live city.
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, 'rgba(255, 150, 60, 0.25)');
    grad.addColorStop(1, 'rgba(20, 20, 60, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    text('SOLMAR BAY', viewW / 2, 190, 84, '#fff6e0', 'center', true);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(viewW / 2 - 220, 214);
    ctx.lineTo(viewW / 2 + 220, 214);
    ctx.stroke();
    text('STREETS OF GOLD', viewW / 2, 258, 30, PALETTE.gold, 'center', true);
    text('An original open-world crime game — explore the city on foot and by car,', viewW / 2, 312, 19, PALETTE.text, 'center');
    text('steal cars, outrun the police, and run six story missions for Rico.', viewW / 2, 340, 19, PALETTE.text, 'center');
    // Menu card.
    const cw = 460;
    const cx = (viewW - cw) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(cx, 380, cw, 190, 14);
    ctx.fill();
    text('▶  Press ENTER or click to play', viewW / 2, 432, 22, '#fff', 'center', true);
    text('Continue a saved game: press C', viewW / 2, 470, 17, PALETTE.muted, 'center');
    text('WASD move · Mouse aim · Click shoot · E enter car · P pause', viewW / 2, 506, 16, PALETTE.muted, 'center');
    text(`Best cash: $${best.toLocaleString('en-US')}   ·   6 missions   ·   Free roam after the story`, viewW / 2, 540, 15, PALETTE.muted, 'center');
    text('A 100% original game — its city, people and story are invented, not borrowed.', viewW / 2, viewH - 24, 14, 'rgba(255,246,224,0.7)', 'center');
  }

  /** Paint one frame. `screen` is one of the SCREEN_* constants. */
  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    ctx.scale(ratio, ratio);
    // Camera: follow the player, zoomed out a little while driving.
    const targetZoom = state.player.inCar ? 0.82 : 1.0;
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 24 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 24 : 0;
    camera.x = state.player.x + shakeX;
    camera.y = state.player.y + shakeY;
    // Never show the void outside the city: clamp the view to the world.
    const halfW = viewW / 2 / camera.zoom;
    const halfH = viewH / 2 / camera.zoom;
    camera.x = clamp(camera.x, halfW, WORLD.width - halfW);
    camera.y = clamp(camera.y, halfH, WORLD.height - halfH);
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, viewW, viewH);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawWorld(state);
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.', 'Q saves your game. M mutes the sound.'], 'Press P or click to resume');
    } else if (screen === SCREEN_OVER) {
      const wasted = state.wasted;
      drawPanel(wasted ? 'WASTED' : 'BUSTED',
        [wasted ? 'You woke up at St. Marina Hospital.' : 'The police caught you.',
          `Cash lost: $${state.bustedLost}.`,
          `Missions done: ${state.stats.missionsDone} of 6 · Cash: $${state.cash}.`],
        'Press ENTER or click to keep playing', PALETTE.red);
    } else if (screen === SCREEN_WIN) {
      drawPanel('YOU OWN SOLMAR BAY', ['All six story missions complete.', `Cash: $${state.cash} · Cars stolen: ${state.stats.carsStolen} · Stashes found: ${state.stats.stashes}.`, 'Taxi jobs and hidden stashes still pay.'],
        'Press ENTER to keep playing the city', PALETTE.gold);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, camera: () => camera };
}
