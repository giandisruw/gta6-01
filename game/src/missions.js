// Missions and story: Mara Solis comes home to Solmar Bay and works her way up for Rico,
// the fixer at the garage. Six story missions, then repeatable taxi jobs and hidden cash
// stashes keep the city paying. All original characters, places and story.
import { PLACES } from './config.js';
import { dist, range } from './random.js';

export const MISSIONS = [
  {
    id: 'welcome-home',
    title: 'Welcome Home',
    briefing: 'Mara Solis is back in Solmar Bay after five years away. Rico, an old friend who runs a garage, wants to see her. Get to Rico\'s Garage.',
    stages: [{ text: 'Go to Rico\'s Garage', target: 'garage', radius: 90 }],
    reward: 200,
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    briefing: 'Rico needs a fast car for a client, no questions asked. Steal any car on the street (walk up and press E) and bring it to the garage.',
    stages: [
      { text: 'Steal a car (press E beside one)', target: null, radius: 0, needCar: true },
      { text: 'Deliver the car to Rico\'s Garage', target: 'garage', radius: 110 },
    ],
    reward: 450,
  },
  {
    id: 'the-package',
    title: 'The Package',
    briefing: 'A package is waiting at Portside Docks. Pick it up (press E) and deliver it to Liberty Plaza. The harbour patrol is jumpy — expect heat.',
    stages: [
      { text: 'Pick up the package at Portside Docks', target: 'docks', radius: 80, pickup: true },
      { text: 'Deliver the package to Liberty Plaza', target: 'plaza', radius: 90 },
    ],
    reward: 600,
  },
  {
    id: 'getaway-driver',
    title: 'Getaway Driver',
    briefing: 'Rico is in trouble and needs a driver, fast. Pick him up at the garage, then hit all three checkpoints before the timer runs out — with the police on your tail.',
    stages: [
      { text: 'Pick up Rico at the garage', target: 'garage', radius: 90 },
      { text: 'Checkpoint 1 of 3 — North Hills', target: { x: 2900, y: 400, name: 'North Hills' }, radius: 100, timer: 100, wanted: 2 },
      { text: 'Checkpoint 2 of 3 — Marina', target: { x: 400, y: 400, name: 'Marina' }, radius: 100 },
      { text: 'Checkpoint 3 of 3 — South Market', target: { x: 900, y: 2300, name: 'South Market' }, radius: 100 },
    ],
    reward: 900,
  },
  {
    id: 'street-fight',
    title: 'Street Fight',
    briefing: 'The Vipers gang is muscling into South Market. Rico wants them taught a lesson. Go to the market and deal with all three of them. Aim with the mouse, click to shoot.',
    stages: [
      { text: 'Go to South Market', target: 'market', radius: 120, spawnGang: 3 },
      { text: 'Defeat the Vipers (0 / 3)', target: null, radius: 0, killGang: true },
    ],
    reward: 800,
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    briefing: 'The job Rico has been planning for months: Bay Trust Bank. Get inside the vault (hold E by the door), grab the cash, then lose the heat and reach the safehouse.',
    stages: [
      { text: 'Go to Bay Trust Bank', target: 'bank', radius: 100 },
      { text: 'Hold E at the vault door to crack it', target: 'bank', radius: 90, hold: 4 },
      { text: 'Escape to the Safehouse — lose the police!', target: 'safehouse', radius: 110, wanted: 3 },
    ],
    reward: 2500,
  },
];

export function createMissions(random) {
  const stashes = [];
  const spots = [
    [300, 1400], [900, 500], [1900, 500], [2900, 900], [3300, 1400],
    [500, 1900], [1400, 1900], [2400, 1400], [1900, 2300], [2900, 1900],
    [1400, 400], [2400, 2300],
  ];
  for (const [x, y] of spots) stashes.push({ x: x + range(random, -40, 40), y: y + range(random, -40, 40), taken: false });
  return {
    index: 0, // which mission is current; == MISSIONS.length means the story is done
    stage: 0,
    timer: 0,
    holdProgress: 0,
    hasPackage: false,
    carrying: false,
    taxi: null, // {pickup:{x,y}, dropoff:{x,y}, fare, state}
    taxiCooldown: 0,
    stashes,
    storyDone: false,
  };
}

export function currentMission(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

export function currentStage(missions) {
  const m = currentMission(missions);
  return m ? m.stages[missions.stage] : null;
}

/** Resolve a stage target to coordinates. */
export function stageTarget(stage) {
  if (!stage || !stage.target) return null;
  if (typeof stage.target === 'string') return PLACES[stage.target];
  return stage.target;
}

export function missionObjective(missions) {
  const m = currentMission(missions);
  if (!m) {
    if (missions.taxi) {
      const t = missions.taxi;
      return t.state === 'pickup'
        ? `Taxi job: pick up ${t.customer} ($${t.fare})`
        : `Taxi job: drive ${t.customer} to ${t.dropoff.name} ($${t.fare})`;
    }
    return 'Free roam — find cash stashes, take taxi jobs, or just drive.';
  }
  const stage = m.stages[missions.stage];
  let text = stage.text;
  if (stage.killGang) text = `Defeat the Vipers (${m._gangLeft ?? 3} left)`;
  return `${m.title}: ${text}`;
}

/** Start a taxi job: a customer waits somewhere in the city. */
export function offerTaxi(missions, random, city) {
  const names = ['Ana', 'Luis', 'Carmen', 'Diego', 'Sofia', 'Marco'];
  const p = city.randomRoadPoint();
  const q = city.randomRoadPoint();
  const fare = 60 + Math.floor(random() * 120);
  missions.taxi = {
    customer: names[Math.floor(random() * names.length)],
    pickup: { x: p.x, y: p.y, name: 'Pickup' },
    dropoff: { x: q.x, y: q.y, name: 'Destination' },
    fare,
    state: 'pickup',
  };
  return missions.taxi;
}

export function taxiTarget(missions) {
  if (!missions.taxi) return null;
  return missions.taxi.state === 'pickup' ? missions.taxi.pickup : missions.taxi.dropoff;
}

/** Distance from the player to the current objective target, or null. */
export function objectiveDistance(missions, px, py) {
  const stage = currentStage(missions);
  const t = stage ? stageTarget(stage) : taxiTarget(missions);
  if (!t) return null;
  return Math.round(dist(px, py, t.x, t.y));
}
