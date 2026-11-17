// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, busted/wasted and win.
// Progress autosaves on every mission and on Q; C on the title screen continues a save.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOOT, EVENT_STASH, EVENT_STEAL, EVENT_TAXI, EVENT_WASTED, createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_SAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
world.state.seed = seed;
window.__world = world; // test/debug hook: lets automated play-tests read the state.
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best cash then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
    return true;
  } catch {
    return false;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let continuePressed = false;
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) continuePressed = true;
  });

  function announce(message) {
    status.textContent = message;
  }

  function saveGame(quiet) {
    if (writeSave()) {
      if (!quiet) world.message('Game saved.');
      return true;
    }
    if (!quiet) world.message('Could not save (storage unavailable).');
    return false;
  }

  function startGame(fromSave) {
    world.reset();
    if (fromSave) {
      const data = readSave();
      if (data && world.loadData(data)) {
        world.message('Welcome back to Solmar Bay.');
      }
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Mara Solis is back in Solmar Bay.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_MISSION) { audio.mission(); saveGame(true); }
    if (events & (EVENT_STASH | EVENT_PICKUP | EVENT_TAXI)) audio.cash();
    if (events & EVENT_STEAL) audio.pickup();
    if (events & EVENT_BUSTED) { audio.fail(); }
    if (events & EVENT_WASTED) { audio.fail(); }
  }

  function step() {
    const mouse = input.mouse();
    const mouseWorld = renderer.screenToWorld(mouse.x, mouse.y);
    const p = world.state.player;
    const aimAngle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
    const frameInput = {
      move: input.move(),
      aimAngle,
      sprint: input.sprint(),
      handbrake: input.handbrake(),
      interactPressed: input.takeInteract(),
      interactHeld: input.interactHeld(),
      shootPressed: input.takeShoot(),
    };
    const events = world.step(STEP, frameInput);
    handleEvents(events);
    if (events & (EVENT_BUSTED | EVENT_WASTED)) {
      screen = SCREEN_OVER;
      if (world.state.cash > best) {
        best = world.state.cash;
        saveBest(best);
      }
      saveGame(true);
      announce(world.state.wasted ? 'Wasted. You woke up at the hospital.' : 'Busted. The police caught you.');
    } else if (world.state.missions.storyDone && screen === SCREEN_PLAY && !world.state._winShown) {
      world.state._winShown = true;
      screen = SCREEN_WIN;
      saveGame(true);
    }
    // Engine and siren follow the driving and the heat.
    const car = p.inCar ? world.state.cars.find((c) => c.id === p.carId) : null;
    audio.engine(car ? Math.abs(car.speed) / 660 : 0, !!car);
    audio.siren(world.state.police.wanted >= 2);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      world.message(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if ((actions & ACTION_CONFIRM) || continuePressed) {
        const fromSave = continuePressed && readSave() !== null;
        continuePressed = false;
        audio.unlock();
        startGame(fromSave);
      } else {
        continuePressed = false;
      }
      // The title screen's city stays alive behind the logo.
      while (accumulator >= STEP) {
        world.step(STEP, { move: { x: 0, y: 0 }, aimAngle: 0, sprint: false, handbrake: false, interactPressed: false, interactHeld: false, shootPressed: false });
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_SAVE) {
        saveGame(false);
      } else {
        while (accumulator >= STEP) {
          step();
          accumulator -= STEP;
          if (screen !== SCREEN_PLAY) { accumulator = 0; break; }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_SAVE) {
        saveGame(false);
      }
      accumulator = 0;
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        world.state.wasted = false;
        announce('Playing.');
      }
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
    window.__screen = screen;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to play. Press C to continue your saved game.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
