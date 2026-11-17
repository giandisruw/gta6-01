// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps with a scripted driver, so
// the frame is what real play looks like and the same seed always gives the same frame.
import { PLACES, STEP } from './config.js';
import { angleTo, clamp } from './random.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function blankInput() {
  return { move: { x: 0, y: 0 }, aimAngle: 0, sprint: false, handbrake: false, interactPressed: false, interactHeld: false, shootPressed: false };
}

/** Steer a car toward a point: throttle on, steer left/right by the heading error. */
function driveToward(state, tx, ty) {
  const car = state.cars.find((c) => c.id === state.player.carId);
  const input = blankInput();
  if (!car) return input;
  const want = angleTo(car.x, car.y, tx, ty);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  input.move.y = -1;
  input.move.x = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
  return input;
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    // Title screen over a live city: let traffic and pedestrians move a while.
    for (let i = 0; i < 8 / STEP; i += 1) world.step(STEP, blankInput());
    return { screen: SCREEN_TITLE, best: 2450 };
  }

  if (name === 'drive') {
    // Mara in the yellow sports car by the garage, driving north up the avenue.
    const car = world.debug.giveCar('sports', 1400, 1250, -Math.PI / 2);
    state.player.x = car.x;
    state.player.y = car.y;
    world.debug.enterNearestCar();
    world.debug.clearTraffic();
    // Stop while still flying up the avenue — before the car reaches the target point.
    for (let i = 0; i < 3 / STEP; i += 1) {
      world.step(STEP, driveToward(state, 1400, 400));
      if (state.player.y < 620) break;
    }
    return { screen: SCREEN_PLAY, best: 2450 };
  }

  if (name === 'chase') {
    // Three wanted stars, Mara fleeing east along the coast road with police cars behind.
    const car = world.debug.giveCar('muscle', 500, 2300, 0);
    state.player.x = car.x;
    state.player.y = car.y;
    world.debug.enterNearestCar();
    world.debug.clearTraffic();
    world.debug.setWanted(3);
    // Two pursuit cars start on the same road, just behind the player, and the police
    // are faster than the muscle car — so they close in instead of falling behind.
    world.debug.spawnPolice(250, 2300, 0);
    world.debug.spawnPolice(20, 2300, 0);
    for (let i = 0; i < 4.5 / STEP; i += 1) {
      world.step(STEP, driveToward(state, 3400, 2300));
      if (state.player.x > 2900) break;
    }
    state.messages.length = 0;
    return { screen: SCREEN_PLAY, best: 2450 };
  }

  // mission: the Street Fight at South Market — Mara on foot, Vipers closing in.
  world.debug.setMission(4, 0);
  world.debug.teleport(PLACES.market.x - 40, PLACES.market.y + 60);
  for (let i = 0; i < 2.5 / STEP; i += 1) world.step(STEP, blankInput());
  // Walk into the market square so the gang spawns, then fight for a couple of seconds —
  // two shots only, so the capture shows Vipers still standing and no mission banner.
  for (let i = 0; i < 1.5 / STEP; i += 1) {
    const input = blankInput();
    input.move.x = 0.4;
    input.move.y = -0.4;
    world.step(STEP, input);
  }
  world.debug.teleport(900, 1760); // on the avenue just north of the market square
  for (let i = 0; i < 2 / STEP; i += 1) {
    const input = blankInput();
    const g = state.combat.gang[0];
    if (g) {
      input.aimAngle = angleTo(state.player.x, state.player.y, g.x, g.y);
      input.shootPressed = i === 0 || i === 22;
    }
    world.step(STEP, input);
  }
  state.messages.length = 0;
  return { screen: SCREEN_PLAY, best: 2450 };
}
