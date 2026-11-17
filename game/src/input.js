// Keyboard and mouse input. Held keys give a movement vector; one-shot presses (start,
// pause, interact, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse aims and shoots.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_SAVE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);
const MUTE = new Set(['KeyM']);
const SAVE = new Set(['KeyQ']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDownEdge = false;
  let interactEdge = false;
  let interactHeld = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) { if (CONFIRM.has(event.code) || INTERACT.has(event.code)) event.preventDefault(); return; }
    held.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (SAVE.has(event.code)) actions |= ACTION_SAVE;
    else if (INTERACT.has(event.code)) { interactEdge = true; interactHeld = true; }
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || CONFIRM.has(event.code) || PAUSE.has(event.code) || INTERACT.has(event.code)
      || SPRINT.has(event.code) || HANDBRAKE.has(event.code) || MUTE.has(event.code) || SAVE.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
    if (INTERACT.has(event.code)) interactHeld = false;
  });
  window.addEventListener('blur', () => {
    held.clear();
    interactHeld = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDownEdge = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Normalised WASD / arrows vector: x right, y down. */
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const y = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      return { x, y };
    },
    sprint() { return has(SPRINT); },
    handbrake() { return has(HANDBRAKE); },
    mouse() { return { x: mouseX, y: mouseY }; },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True once when the mouse button or E was pressed since the last call. */
    takeShoot() {
      const shot = mouseDownEdge;
      mouseDownEdge = false;
      return shot;
    },
    takeInteract() {
      const pressed = interactEdge;
      interactEdge = false;
      return pressed;
    },
    interactHeld() { return interactHeld; },
  };
}
