import assert from "node:assert/strict";
import { drawFood } from "../dist/client/rendering/foodRenderer.js";

function recordingContext() {
  const calls = new Map();
  const assignments = new Map();
  const callArgs = new Map();
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === "calls") return calls;
      if (property === "assignments") return assignments;
      if (property === "callArgs") return callArgs;
      return (...args) => {
        calls.set(property, (calls.get(property) ?? 0) + 1);
        const recorded = callArgs.get(property) ?? [];
        recorded.push(args);
        callArgs.set(property, recorded);
      };
    },
    set(_target, property, value) {
      const values = assignments.get(property) ?? [];
      values.push(value);
      assignments.set(property, values);
      return true;
    }
  });
  return context;
}

let createdCanvases = 0;
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, "canvas");
    createdCanvases++;
    const context = recordingContext();
    return { width: 0, height: 0, getContext: () => context };
  }
};

const foods = [];
const appearances = [[0, 1], [0, 2], [1, 3], [1, 4], [1, 5], [2, 5], [2, 10]];
for (const [kind, value] of appearances) {
  for (let variant = 0; variant < 3; variant++) {
    foods.push({ id: foods.length * 3 + variant, x: variant * 20, y: kind * 20, kind, value });
  }
}

const context = recordingContext();
const env = {
  ctx: context,
  canvas: { clientWidth: 1280, clientHeight: 720 },
  camera: { x: 0, y: 0, zoom: 1 },
  arenaRadius: 1600,
  effects: true
};

drawFood(env, foods, 1000);
drawFood(env, foods, 1016);

assert.equal(context.calls.get("drawImage"), foods.length * 2, "visible food uses one cached bitmap draw per frame");
assert.equal(createdCanvases, appearances.length * 3, "food appearances are cached across frames");

console.log("Renderer performance regression tests passed");

let snakeSpritesReady = true;
globalThis.Image = class {
  naturalWidth = 1254;
  naturalHeight = 1254;
  src = "";
  get complete() { return snakeSpritesReady; }
};

const { drawSnake } = await import("../dist/client/rendering/snakeRenderer.js");
const snakeContext = recordingContext();
const snakeEnv = { ...env, ctx: snakeContext };
const ember = {
  id: "ember-snake",
  nickname: "Fire Dragon",
  skin: "ember",
  mass: 42,
  level: 1,
  angle: 0,
  boost: false,
  protected: false,
  isBot: false,
  isBoss: false,
  body: Array.from({ length: 8 }, (_, i) => ({ x: 100 - i * 13, y: 50 }))
};

drawSnake(snakeEnv, ember, true, 1000, 1, 1);
assert.equal(snakeContext.calls.get("drawImage"), 5, "ready Ember art draws one head, three sampled body pieces, and one tail");
assert.equal(snakeContext.calls.get("stroke") ?? 0, 0, "sprite skin has no procedural body tube beneath its artwork");

const grownContext = recordingContext();
drawSnake({ ...snakeEnv, ctx: grownContext }, { ...ember, body: [...ember.body, { ...ember.body.at(-1) }] }, true, 1016, 1, 1);
assert.ok(grownContext.callArgs.get("translate").some(([x, y]) => x === 74 && y === 50), "tail growth keeps the nearest sampled body piece anchored behind the head");

snakeSpritesReady = false;
const fallbackContext = recordingContext();
drawSnake({ ...snakeEnv, ctx: fallbackContext }, ember, true, 1016, 1, 1);
assert.equal(fallbackContext.calls.get("drawImage") ?? 0, 0, "unavailable Ember art falls back without drawing incomplete images");
