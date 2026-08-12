import assert from "node:assert/strict";
import fs from "node:fs";
import { CONFIG } from "../dist/shared/config.js";
import { previewLocalSnake } from "../dist/client/inputPreview.js";

assert.ok(CONFIG.TURN_RATE >= 8, "turn rate stays arcade-responsive");
assert.ok(CONFIG.MASS_TURN_PENALTY <= .001, "mass does not destroy steering response");
assert.ok(CONFIG.FOOD_PICKUP_RADIUS >= 27, "food pickup has forgiving contact radius");
assert.ok(CONFIG.FOOD_AMBIENT_TARGET <= 800, "ambient food stays inside render/network budget");
assert.ok(CONFIG.SNAPSHOT_FOOD_RADIUS <= 1450, "food snapshots do not cover the entire compact arena");
assert.ok(CONFIG.SNAPSHOT_SNAKE_RADIUS <= 1700, "snake snapshots stay local enough for bandwidth");
assert.ok(CONFIG.LIVE_INTERPOLATION_DELAY_MS <= 25, "live interpolation stays close to authoritative time");
assert.ok(CONFIG.CANVAS_DPR_CAP <= 1.5, "canvas pixel budget stays bounded");

const windowListeners = new Map();
globalThis.window = {
  addEventListener: (type, fn) => windowListeners.set(type, fn),
  removeEventListener: () => {}
};
const canvasListeners = new Map();
const canvas = {
  addEventListener: (type, fn) => canvasListeners.set(type, fn),
  removeEventListener: () => {},
  setPointerCapture: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 })
};
const emitted = [];
const { InputController } = await import("../dist/client/input.js");
const input = new InputController(canvas, (angle, boost, force) => emitted.push({ angle, boost, force }));
const key = code => ({ code, preventDefault() {} });
windowListeners.get("keydown")(key("KeyW"));
assert.equal(input.state.hasDirection, true, "W activates direction");
assert.ok(Math.abs(input.state.angle + Math.PI / 2) < 1e-9, "W steers up");
assert.equal(emitted.at(-1).force, true, "keyboard steering bypasses pointer throttle");
windowListeners.get("keydown")(key("KeyD"));
assert.ok(Math.abs(input.state.angle + Math.PI / 4) < 1e-9, "W+D steers diagonally");
windowListeners.get("keyup")(key("KeyW"));
assert.ok(Math.abs(input.state.angle) < 1e-9, "D remains active after W release");
windowListeners.get("keyup")(key("KeyD"));
const heldAngle = input.state.angle;
const emittedBeforeDeadzone = emitted.length;
canvasListeners.get("pointermove")({ pointerType: "mouse", clientX: 106, clientY: 104, preventDefault() {} });
assert.equal(input.state.angle, heldAngle, "mouse center dead-zone preserves last heading");
assert.equal(emitted.length, emittedBeforeDeadzone, "mouse center dead-zone emits no jitter input");
input.dispose();

const snake = {
  id: "me", nickname: "Me", skin: "nova", mass: 42, score: 0, kills: 0,
  angle: 0, boost: false, protected: false,
  body: Array.from({ length: 12 }, (_, i) => ({ x: -i * 13, y: 0 }))
};
const original = JSON.stringify(snake);
const preview = previewLocalSnake(snake, Math.PI / 2, false);
assert.ok(preview.angle > .4, "local head previews a requested turn before the next snapshot");
assert.ok(preview.body[0].y > 5, "local head visibly advances into requested turn");
assert.ok(Math.abs(preview.body.at(-1).y) < 2, "preview decays before the tail");
assert.equal(JSON.stringify(snake), original, "local preview never mutates authoritative snapshot data");

const clientSource = fs.readFileSync(new URL("../src/client/gameClient.ts", import.meta.url), "utf8");
const rendererSource = fs.readFileSync(new URL("../src/client/rendering/renderer.ts", import.meta.url), "utf8");
assert.match(clientSource, /if \(this\.input\.state\.hasDirection\) this\.sendInput/, "fresh welcome does not force a default eastward turn");
assert.match(clientSource, /previewRenderPair/, "live local rendering applies short input preview");
assert.match(rendererSource, /CONFIG\.CANVAS_DPR_CAP/, "renderer uses bounded DPR");

console.log("Responsiveness regression suite passed");
