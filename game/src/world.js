// Solmar Bay's rules and state, with no drawing and no browser in it: the player on foot
// and in cars, traffic, pedestrians, police, combat, missions, taxi jobs, cash stashes and
// particles. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (sounds, announcements) without the world knowing about screens.
import { BEACH_X, CAR, PLACES, PLAYER, ROAD_W, START, WANTED, WORLD } from './config.js';
import { buildCity } from './city.js';
import { angleTo, clamp, dist } from './random.js';
import { carContains, collideCars, makeCar, spawnParkedCar, spawnTrafficCar, stepPlayerCar, stepTraffic } from './vehicles.js';
import { makePed, stepPeds } from './peds.js';
import { addWanted, bustPlayer, createPolice, stepPolice } from './police.js';
import { createCombat, fireBullet, spawnGang, stepCombat } from './combat.js';
import { MISSIONS, createMissions, currentMission, currentStage, missionObjective, offerTaxi, stageTarget, taxiTarget } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_SHOOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_CRASH = 4;
export const EVENT_MISSION = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_STASH = 64;
export const EVENT_PICKUP = 128;
export const EVENT_TAXI = 256;
export const EVENT_STEAL = 512;

const AMMO_SPOTS = [
  [900, 500], [1900, 2300], [2900, 400], [400, 1400], [2400, 1900], [1400, 2300],
];

export function createWorld(random) {
  const city = buildCity(random);
  const police = createPolice();
  const combat = createCombat();
  const missions = createMissions(random);

  const state = {
    seed: 0,
    time: 15 * 3600, // 3pm, golden hour in Solmar Bay
    cash: 150,
    health: PLAYER.health,
    ammo: 48,
    player: {
      x: START.x, y: START.y, angle: START.angle,
      speed: 0, inCar: false, carId: null, invuln: 0, hurtTimer: 0,
    },
    cars: [],
    peds: [],
    particles: [],
    ammoBoxes: AMMO_SPOTS.map(([x, y]) => ({ x, y, taken: false })),
    police,
    combat,
    missions,
    city,
    messages: [],
    banner: null,
    shake: 0,
    flash: 0,
    crimeCooldown: 0,
    bustedLost: 0,
    wasted: false,
    stats: { carsStolen: 0, missionsDone: 0, stashes: 0, shotsFired: 0, distance: 0 },
  };

  function message(text) {
    state.messages.push({ text, t: 5 });
    if (state.messages.length > 4) state.messages.shift();
  }

  function banner(title, text) {
    state.banner = { title, text, t: 4 };
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const s = (0.3 + random() * 0.7) * (speed || 160);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + random() * 0.5, max: 1, color, size: 3 + random() * 4 });
    }
  }

  function spawnInitial() {
    state.cars.length = 0;
    state.peds.length = 0;
    for (let i = 0; i < 16; i += 1) state.cars.push(spawnTrafficCar(random, city));
    for (let i = 0; i < 7; i += 1) state.cars.push(spawnParkedCar(random, city));
    // A sports car parked by the garage, so the first drive is a good one.
    const sport = makeCar(random, 'sports', 1330, 1010, 0);
    sport.driver = 'none';
    state.cars.push(sport);
    for (let i = 0; i < 26; i += 1) {
      const ped = makePed(random, city);
      ped.tx = ped.x;
      ped.ty = ped.y;
      state.peds.push(ped);
    }
  }

  function reset() {
    state.time = 15 * 3600;
    state.cash = 150;
    state.health = PLAYER.health;
    state.ammo = 48;
    state.player.x = START.x;
    state.player.y = START.y;
    state.player.angle = START.angle;
    state.player.inCar = false;
    state.player.carId = null;
    state.player.invuln = 0;
    state.messages.length = 0;
    state.banner = null;
    state.particles.length = 0;
    state.crimeCooldown = 0;
    state.bustedLost = 0;
    state.wasted = false;
    state.stats = { carsStolen: 0, missionsDone: 0, stashes: 0, shotsFired: 0, distance: 0 };
    police.wanted = 0;
    police.heat = 0;
    police.coolTimer = 0;
    police.bustTimer = 0;
    police.cops.length = 0;
    combat.bullets.length = 0;
    combat.gang.length = 0;
    const fresh = createMissions(random);
    missions.index = 0;
    missions.stage = 0;
    missions.timer = 0;
    missions.holdProgress = 0;
    missions.hasPackage = false;
    missions.taxi = null;
    missions.taxiCooldown = 0;
    missions.storyDone = false;
    for (const s of missions.stashes) s.taken = false;
    for (const b of state.ammoBoxes) b.taken = false;
    spawnInitial();
    enterStage();
  }

  /** Run the entry effects of the current mission stage (spawns, timers, wanted). */
  function enterStage() {
    const stage = currentStage(missions);
    if (!stage) return;
    missions.holdProgress = 0;
    if (stage.timer) missions.timer = stage.timer;
    if (stage.wanted) addWanted(police, stage.wanted, 'mission');
    if (stage.spawnGang) spawnGang(combat, random, PLACES.market.x, PLACES.market.y, stage.spawnGang);
  }

  function advanceStage() {
    const m = currentMission(missions);
    if (!m) return;
    missions.stage += 1;
    if (missions.stage >= m.stages.length) {
      state.cash += m.reward;
      state.stats.missionsDone += 1;
      banner('Mission complete', `${m.title} — +$${m.reward}`);
      message(`Mission complete: ${m.title} (+$${m.reward})`);
      missions.index += 1;
      missions.stage = 0;
      if (missions.index >= MISSIONS.length) {
        missions.storyDone = true;
        banner('Story complete', 'You own Solmar Bay now. Taxi jobs and stashes still pay.');
        message('Story complete! Taxi jobs are now available — drive and earn.');
      } else {
        const next = MISSIONS[missions.index];
        banner(next.title, next.briefing);
        message(`New mission: ${next.title}`);
      }
      enterStage();
      state._missionEvent = true;
    } else {
      enterStage();
    }
  }

  function failMission(reason) {
    const m = currentMission(missions);
    if (!m) return;
    missions.stage = 0;
    missions.timer = 0;
    missions.hasPackage = false;
    message(`Mission failed: ${reason}. ${m.title} restarted.`);
    banner('Mission failed', reason);
    enterStage();
  }

  function nearestCar(x, y, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    if (car.driver === 'traffic' || car.driver === 'none') {
      if (car.type !== 'police') {
        addWanted(police, 1, 'steal');
        state.stats.carsStolen += 1;
        message('You stole a car! The police are onto you.');
        state._stealEvent = true;
      } else {
        addWanted(police, 2, 'steal police');
        message('You stole a police car!');
      }
    }
    car.driver = 'player';
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    p.inCar = true;
    p.carId = car.id;
    p.x = car.x;
    p.y = car.y;
  }

  function exitCar() {
    const p = state.player;
    const car = state.cars.find((c) => c.id === p.carId);
    if (!car) { p.inCar = false; p.carId = null; return; }
    car.driver = 'none';
    car.speed = 0;
    const side = Math.cos(car.angle + Math.PI / 2);
    const sideY = Math.sin(car.angle + Math.PI / 2);
    p.x = car.x + side * 34;
    p.y = car.y + sideY * 34;
    const fixed = city.resolveBuildings(p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.inCar = false;
    p.carId = null;
  }

  function explodeCar(car) {
    car.dead = true;
    car.driver = 'none';
    burst(car.x, car.y, '#ff7a2f', 26, 320);
    burst(car.x, car.y, '#3a3f47', 16, 160);
    state.shake = 0.5;
    state._crashEvent = true;
    if (state.player.carId === car.id) {
      state.player.inCar = false;
      state.player.carId = null;
      state.player.x = car.x + 40;
      state.player.y = car.y + 40;
      state.player.health -= 35;
      message('Your car blew up!');
    }
  }

  /**
   * One fixed step. `input` carries the frame's movement, aim and one-shot presses.
   * Returns bit flags (EVENT_*) for sounds and announcements.
   */
  function step(dt, input) {
    let events = EVENT_NONE;
    state._missionEvent = false;
    state._stealEvent = false;
    state._crashEvent = false;
    const p = state.player;
    state.time += dt * 60; // a game hour every game minute
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtTimer > 0) p.hurtTimer -= dt;
    if (state.flash > 0) state.flash -= dt;
    if (state.shake > 0) state.shake -= dt;
    if (state.banner && (state.banner.t -= dt) <= 0) state.banner = null;
    for (const m of state.messages) m.t -= dt;
    state.messages = state.messages.filter((m) => m.t > 0);

    // --- mission timer ---
    const stage = currentStage(missions);
    if (stage && stage.timer && missions.timer > 0) {
      missions.timer -= dt;
      if (missions.timer <= 0) failMission('Out of time.');
    }

    // --- player movement ---
    const prevX = p.x;
    const prevY = p.y;
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.carId);
      if (!car || car.dead) {
        p.inCar = false;
        p.carId = null;
      } else {
        const drive = {
          up: input.move.y < -0.2, down: input.move.y > 0.2,
          left: input.move.x < -0.2, right: input.move.x > 0.2,
          handbrake: input.handbrake,
        };
        const { skidding } = stepPlayerCar(car, drive, dt);
        if (skidding && Math.random() < 0.6) {
          state.particles.push({ x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20, vx: 0, vy: 0, life: 0.5, max: 0.5, color: '#9a9a9a', size: 5 });
        }
        // Buildings stop cars hard.
        const fixed = city.resolveBuildings(car.x, car.y, car.w / 2 - 2);
        if (fixed.x !== car.x || fixed.y !== car.y) {
          const impact = Math.abs(car.speed);
          if (impact > 260) {
            car.hp -= impact * 0.06;
            state.shake = Math.min(0.4, impact / 1200);
            burst(car.x, car.y, '#ffd23f', 8, 200);
            events |= EVENT_CRASH;
          }
          car.x = fixed.x;
          car.y = fixed.y;
          car.speed *= 0.4;
          car.vx = 0;
          car.vy = 0;
        }
        const clamped = city.clampInside(car.x, car.y, car.w / 2);
        car.x = clamped.x;
        car.y = clamped.y;
        p.x = car.x;
        p.y = car.y;
        p.angle = car.angle;
        if (car.hp <= 0 && !car.dead) explodeCar(car);
      }
    } else {
      const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const mx = input.move.x;
      const my = input.move.y;
      const len = Math.hypot(mx, my) || 1;
      p.x += (mx / len) * speed * dt * (mx || my ? 1 : 0);
      p.y += (my / len) * speed * dt * (mx || my ? 1 : 0);
      p.angle = input.aimAngle;
      const fixed = city.resolveBuildings(p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      const clamped = city.clampInside(p.x, p.y, PLAYER.radius);
      p.x = clamped.x;
      p.y = clamped.y;
      // Traffic can run the player over.
      for (const car of state.cars) {
        if (car.dead || car.driver === 'player') continue;
        if (carContains(car, p.x, p.y, PLAYER.radius - 4) && Math.abs(car.speed) > 60 && p.invuln <= 0) {
          p.health -= 12;
          p.invuln = 0.8;
          state.flash = 0.4;
          p.x += Math.cos(car.angle) * 30;
          p.y += Math.sin(car.angle) * 30;
          message('Hit by a car!');
        }
      }
    }
    state.stats.distance += dist(prevX, prevY, p.x, p.y);

    // --- car vs car ---
    for (let i = 0; i < state.cars.length; i += 1) {
      const a = state.cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const b = state.cars[j];
        if (b.dead) continue;
        const impact = collideCars(a, b);
        if (impact > 220) {
          events |= EVENT_CRASH;
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd23f', 6, 160);
          if ((a.driver === 'player' || b.driver === 'player') && impact > 320) state.shake = 0.3;
        }
        if (a.hp <= 0) explodeCar(a);
        if (b.hp <= 0) explodeCar(b);
      }
    }

    // --- enter / exit car, interact ---
    if (input.interactPressed && !p.inCar) {
      const car = nearestCar(p.x, p.y, 70);
      if (car) enterCar(car);
    } else if (input.interactPressed && p.inCar) {
      exitCar();
    }

    // --- shooting / punching ---
    if (input.shootPressed && !p.inCar) {
      if (state.ammo > 0 && combat.shootCooldown <= 0) {
        fireBullet(combat, p.x, p.y, p.angle, 'player', PLAYER.pistolDamage);
        state.ammo -= 1;
        state.stats.shotsFired += 1;
        combat.shootCooldown = 0.22;
        events |= EVENT_SHOOT;
        if (police.wanted < 1) addWanted(police, 1, 'shoot');
      } else if (state.ammo <= 0) {
        // Out of ammo: punch whatever gang member is close.
        for (const g of combat.gang) {
          if (g.alive && dist(p.x, p.y, g.x, g.y) < 46) {
            g.hp -= PLAYER.punchDamage;
            if (g.hp <= 0) g.alive = false;
            events |= EVENT_PUNCH;
            break;
          }
        }
      }
    }

    // --- pedestrians, traffic, police, combat ---
    const danger = police.wanted > 0 || state._stealEvent ? { x: p.x, y: p.y } : null;
    stepPeds(state.peds, dt, random, city, danger);
    for (const car of state.cars) {
      if (!car.dead) stepTraffic(car, state.cars, dt, random);
    }
    // Player's car running over a pedestrian is a crime.
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.carId);
      if (car && Math.abs(car.speed) > 120) {
        for (const ped of state.peds) {
          if (ped.state !== 'flee' && carContains(car, ped.x, ped.y, 6)) {
            ped.state = 'flee';
            ped.panic = 2;
            if (state.crimeCooldown <= 0) {
              addWanted(police, 1, 'hit ped');
              state.crimeCooldown = 3;
              message('You hit a pedestrian!');
            }
          }
        }
      }
    }
    let busted = false;
    stepPolice(police, dt, random, city, p, state.cars, () => { busted = true; });
    if (busted) {
      state.bustedLost = bustPlayer(state);
      state.wasted = false;
      events |= EVENT_BUSTED;
      banner('BUSTED', `The police caught you. You lost $${state.bustedLost}.`);
      message(`Busted! Lost $${state.bustedLost}.`);
      missions.timer = 0;
    }
    const gangLeft = stepCombat(combat, dt, random, p, city, (dmg) => {
      state.flash = 0.3;
      state.shake = Math.max(state.shake, 0.15);
    });
    if (stage && stage.killGang) MISSIONS[missions.index]._gangLeft = gangLeft;

    // --- collectibles and ammo ---
    for (const s of missions.stashes) {
      if (!s.taken && dist(p.x, p.y, s.x, s.y) < 34) {
        s.taken = true;
        state.cash += 100;
        state.stats.stashes += 1;
        events |= EVENT_STASH;
        message('Found a hidden cash stash! +$100');
      }
    }
    for (const b of state.ammoBoxes) {
      if (!b.taken && dist(p.x, p.y, b.x, b.y) < 34) {
        b.taken = true;
        state.ammo += 30;
        events |= EVENT_PICKUP;
        message('Ammo crate! +30 bullets');
      }
    }

    // --- particles ---
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);

    // --- slow health regen while clean ---
    if (police.wanted === 0 && state.health > 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + 1.5 * dt);
    }

    // --- missions ---
    updateMissions(dt, input);
    if (state._missionEvent) events |= EVENT_MISSION;
    if (state._stealEvent) events |= EVENT_STEAL;
    if (state._crashEvent) events |= EVENT_CRASH;

    // --- wasted (health gone) ---
    if (state.health <= 0) {
      const lost = Math.floor(state.cash * 0.1);
      state.cash -= lost;
      state.bustedLost = lost;
      state.wasted = true;
      state.health = PLAYER.health;
      state.player.inCar = false;
      state.player.carId = null;
      state.player.x = PLACES.hospital.x;
      state.player.y = PLACES.hospital.y;
      police.wanted = 0;
      police.cops.length = 0;
      events |= EVENT_WASTED;
      banner('WASTED', `You woke up at St. Marina Hospital. Lost $${lost}.`);
      message(`Wasted! Lost $${lost}.`);
    }

    // --- taxi jobs (after the story) ---
    if (missions.storyDone) {
      if (!missions.taxi) {
        missions.taxiCooldown -= dt;
        if (missions.taxiCooldown <= 0) {
          offerTaxi(missions, random, city);
          message(`Taxi job: pick up ${missions.taxi.customer} for $${missions.taxi.fare}.`);
          events |= EVENT_TAXI;
        }
      } else {
        const t = taxiTarget(missions);
        if (t && p.inCar && dist(p.x, p.y, t.x, t.y) < 90) {
          if (missions.taxi.state === 'pickup') {
            missions.taxi.state = 'dropoff';
            message(`${missions.taxi.customer} got in. Drive to the destination.`);
          } else {
            state.cash += missions.taxi.fare;
            message(`Taxi job done! +$${missions.taxi.fare}`);
            events |= EVENT_TAXI;
            missions.taxi = null;
            missions.taxiCooldown = 25;
          }
        }
      }
    }

    // Keep traffic topped up and the streets alive (unless a screenshot scene froze it).
    const aliveTraffic = state.cars.filter((c) => !c.dead && c.driver === 'traffic').length;
    if (state.trafficTopup !== false && aliveTraffic < 14) state.cars.push(spawnTrafficCar(random, city));
    state.cars = state.cars.filter((c) => !c.dead || c.driver === 'player');
    return events;
  }

  function updateMissions(dt, input) {
    const m = currentMission(missions);
    if (!m) return;
    const stage = m.stages[missions.stage];
    if (!stage) return;
    const target = stageTarget(stage);
    const p = state.player;

    if (stage.needCar && p.inCar) { advanceStage(); return; }
    if (stage.killGang) {
      if (combat.gang.length === 0) { advanceStage(); return; }
      return;
    }
    if (!target) return;
    const d = dist(p.x, p.y, target.x, target.y);
    if (stage.pickup) {
      if (d < stage.radius && input.interactPressed) {
        missions.hasPackage = true;
        message('Package secured. Deliver it to Liberty Plaza.');
        advanceStage();
      }
      return;
    }
    if (stage.hold) {
      if (d < stage.radius && input.interactHeld) {
        missions.holdProgress += dt;
        if (missions.holdProgress >= stage.hold) {
          message('Vault cracked! Grab the cash and run!');
          advanceStage();
        }
      } else {
        missions.holdProgress = Math.max(0, missions.holdProgress - dt * 2);
      }
      return;
    }
    if (d < stage.radius) advanceStage();
  }

  /** Save data for localStorage. */
  function saveData() {
    return {
      cash: state.cash,
      health: state.health,
      ammo: state.ammo,
      x: state.player.x,
      y: state.player.y,
      missionIndex: missions.index,
      stashes: missions.stashes.map((s) => s.taken),
      stats: state.stats,
    };
  }

  function loadData(data) {
    if (!data) return false;
    reset();
    state.cash = data.cash ?? 150;
    state.health = data.health ?? PLAYER.health;
    state.ammo = data.ammo ?? 48;
    state.player.x = data.x ?? START.x;
    state.player.y = data.y ?? START.y;
    missions.index = data.missionIndex ?? 0;
    missions.stage = 0;
    if (Array.isArray(data.stashes)) {
      data.stashes.forEach((taken, i) => { if (missions.stashes[i]) missions.stashes[i].taken = !!taken; });
    }
    if (data.stats) state.stats = { ...state.stats, ...data.stats };
    enterStage();
    return true;
  }

  reset();
  return {
    state, reset, step, message, banner,
    objective: () => missionObjective(missions),
    saveData, loadData,
    // Staging helpers for screenshots and tests (not used by normal play).
    debug: {
      setMission(index, stageIndex) {
        missions.index = index;
        missions.stage = stageIndex || 0;
        enterStage();
      },
      setWanted(n) { police.wanted = n; police.heat = n; },
      giveCar(type, x, y, angle) {
        const car = makeCar(random, type, x, y, angle || 0);
        car.driver = 'none';
        state.cars.push(car);
        return car;
      },
      teleport(x, y) { state.player.x = x; state.player.y = y; },
      enterNearestCar() {
        const car = nearestCar(state.player.x, state.player.y, 400);
        if (car) enterCar(car);
        return car;
      },
      /** Put a police pursuit car on the road behind the player (screenshot staging). */
      spawnPolice(x, y, angle) {
        const car = makeCar(random, 'police', x, y, angle || 0);
        car.driver = 'police';
        state.cars.push(car);
        police.cops.push({ x, y, angle: angle || 0, speed: 0, kind: 'car', carId: car.id });
        return car;
      },
      /** Remove every car except the player's, for a clean staged shot. */
      clearTraffic() {
        const keep = state.player.carId;
        state.cars = state.cars.filter((c) => c.id === keep);
        state.trafficTopup = false;
      },
    },
  };
}
