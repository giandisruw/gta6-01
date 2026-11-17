// Solmar Bay — every tuning number, colour and city constant in one place.
// The world is a fixed 3600x2600 open city; the renderer scales a camera view of it
// to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3600, height: 2600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Vertical and horizontal road centre-lines; roads are ROAD_W wide. */
export const ROADS_X = [400, 900, 1400, 1900, 2400, 2900, 3300];
export const ROADS_Y = [400, 900, 1400, 1900, 2300];
export const ROAD_W = 130;

/** Beach strip on the west edge, then open water the player cannot enter. */
export const BEACH_X = 260;
export const WATER_X = 120;

export const PLAYER = {
  radius: 16,
  walkSpeed: 230,
  sprintSpeed: 330,
  health: 100,
  punchDamage: 25,
  pistolDamage: 34,
};

export const CAR = {
  accel: 430,
  brake: 700,
  reverseMax: 170,
  maxSpeed: 560,
  sportsMax: 660,
  truckMax: 430,
  turnRate: 2.6,
  grip: 6.0,
  hp: 100,
};

export const WANTED = {
  max: 5,
  decaySeconds: 12,
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
};

export const PALETTE = {
  sky: '#f7c873',
  skyTop: '#ffd98f',
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  sand: '#ecd9a0',
  water: '#3f8fc4',
  waterDeep: '#2f74a8',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#e8d44d',
  sidewalk: '#b9b3a4',
  buildingRoof: ['#c96f4a', '#4a7fa5', '#8a5f9e', '#b5a642', '#5f9e7a', '#a54a5f', '#7a6a4a', '#4a6a8a'],
  buildingWall: '#8d8578',
  park: '#5d8f43',
  tree: '#3f7a34',
  treeLight: '#57a047',
  player: '#ff5a3c',
  playerShirt: '#ffd23f',
  cop: '#2b4acb',
  copCar: '#2244aa',
  taxi: '#f7c531',
  text: '#fff6e0',
  darkText: '#1d2733',
  muted: '#c9bda6',
  panel: 'rgba(20, 26, 38, 0.88)',
  gold: '#ffd23f',
  red: '#e5484d',
  green: '#43c465',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best-cash';

/** Named places the story and the HUD point at. */
export const PLACES = {
  garage: { x: 1400, y: 1010, name: "Rico's Garage" },
  hospital: { x: 900, y: 1330, name: 'St. Marina Hospital' },
  bank: { x: 2400, y: 990, name: 'Bay Trust Bank' },
  docks: { x: 3300, y: 2230, name: 'Portside Docks' },
  market: { x: 900, y: 1830, name: 'South Market' },
  safehouse: { x: 400, y: 2230, name: 'Safehouse' },
  marina: { x: 260, y: 700, name: 'Marina Boardwalk' },
  plaza: { x: 1900, y: 1400, name: 'Liberty Plaza' },
};

export const START = { x: 1400, y: 1180, angle: -Math.PI / 2 };
