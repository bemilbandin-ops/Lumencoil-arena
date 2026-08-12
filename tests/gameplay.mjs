import assert from "node:assert/strict";
import fs from "node:fs";
import { CONFIG } from "../dist/shared/config.js";
import { combatLevel, resolveBodyContact, resolveHeadContact } from "../dist/shared/combat.js";
import { decideBot } from "../dist/server/botAI.js";
import { GameWorld } from "../dist/server/game.js";
import { normalizeAngle } from "../dist/shared/types.js";

assert.ok(CONFIG.ARENA_RADIUS <= 3200, "arena stays compact enough for frequent encounters");
assert.ok(CONFIG.SERVER_TICK_RATE >= 30, "server steering simulation runs at 30 Hz or better");
assert.ok(CONFIG.SNAPSHOT_RATE >= 15, "snapshots arrive at least 15 Hz");
assert.ok(CONFIG.INPUT_MIN_INTERVAL_MS <= 12, "server accepts responsive input cadence");
assert.ok(CONFIG.CLIENT_INPUT_SEND_INTERVAL_MS <= 16, "client sends steering at frame-like cadence");
assert.ok(CONFIG.LIVE_INTERPOLATION_DELAY_MS <= 60, "live interpolation stays below 60 ms");
assert.ok(CONFIG.LIVE_CAMERA_FOLLOW_RATE >= 12, "camera stays close to steering reference");
assert.ok(CONFIG.TURN_RATE >= 4, "starting turn rate is responsive");

assert.ok(combatLevel(60) > combatLevel(45), "larger snake has higher combat level");
assert.equal(resolveHeadContact(60, 45), "attacker", "higher-level head survives head contact");
assert.equal(resolveHeadContact(45, 60), "defender", "lower-level head loses head contact");
assert.equal(resolveHeadContact(50, 50), "both", "same-level head contact remains mutual");
assert.equal(resolveBodyContact(60, 45), "attacker", "higher-level head can consume lower-level body owner");
assert.equal(resolveBodyContact(45, 60), "defender", "lower-level head dies on higher-level body");

const originalRandom = Math.random;
Math.random = () => .5;
try {
  const wanderBrain = {
    profile: "NORMAL", reaction: .1, timer: 0, aggression: .1, risk: .4,
    foodAttraction: 1, boostTendency: 0, preferredEnemyDistance: 250,
    steeringNoise: 0, prediction: .3, wanderHeading: 0
  };
  let self = { id: "self", x: 0, y: 0, angle: 0, mass: 50, alive: true, boost: false };
  let totalTurn = 0;
  for (let i = 0; i < 12; i++) {
    const decision = decideBot(self, wanderBrain, [], [], [self]);
    totalTurn += Math.abs(normalizeAngle(decision.angle - self.angle));
    self = { ...self, angle: decision.angle };
  }
  assert.ok(totalTurn < 1.2, `unstimulated bot should travel instead of orbiting; total turn=${totalTurn}`);

  const hunterBrain = {
    profile: "AGGRESSIVE", reaction: .1, timer: 0, aggression: .95, risk: .7,
    foodAttraction: 1, boostTendency: 0, preferredEnemyDistance: 250,
    steeringNoise: 0, prediction: .3, wanderHeading: 0
  };
  const hunter = { id: "hunter", x: 0, y: 0, angle: 0, mass: 60, alive: true, boost: false };
  const prey = { id: "prey", x: 200, y: 0, angle: 0, mass: 45, alive: true, boost: false };
  const hunt = decideBot(hunter, hunterBrain, [], [], [hunter, prey]);
  assert.ok(Math.abs(normalizeAngle(hunt.angle)) < Math.PI / 2, "larger aggressive bot closes on lower-level prey");
} finally {
  Math.random = originalRandom;
}

function duelWorld() {
  const world = new GameWorld(() => {});
  const human = world.addHuman("duel-human", "Hero", "nova");
  const bot = [...world.snakes.values()].find(s => s.isBot);
  assert.ok(bot);
  for (const [id, snake] of [...world.snakes]) if (snake !== human && snake !== bot) world.snakes.delete(id);
  const old = Date.now() - CONFIG.SPAWN_PROTECTION_MS - 100;
  human.spawnedAt = old;
  bot.spawnedAt = old;
  return { world, human, bot, now: Date.now() };
}

{
  const { world, human, bot, now } = duelWorld();
  human.mass = 60;
  bot.mass = 45;
  human.x = bot.x = 0;
  human.y = bot.y = 0;
  human.body[0] = { x: 0, y: 0 };
  bot.body[0] = { x: 0, y: 0 };
  world.resolveCollisions(now);
  assert.equal(human.alive, true, "higher-level human survives head collision");
  assert.equal(world.snakes.has(bot.id), false, "lower-level bot dies on head collision");
  assert.equal(human.kills, 1, "winner gets kill credit");
}

{
  const { world, human, bot, now } = duelWorld();
  human.mass = 60;
  bot.mass = 45;
  human.x = 0;
  human.y = 0;
  human.body[0] = { x: 0, y: 0 };
  bot.x = 500;
  bot.y = 0;
  bot.body = Array.from({ length: 8 }, (_, i) => ({ x: i === 2 ? 0 : 500 - i * 13, y: 0 }));
  bot.body[0] = { x: 500, y: 0 };
  world.rebuildGrids(now);
  world.resolveCollisions(now);
  assert.equal(human.alive, true, "higher-level head survives lower-level body contact");
  assert.equal(world.snakes.has(bot.id), false, "lower-level body owner is consumed");
}

for (let i = 0; i < 8; i++) {
  const world = new GameWorld(() => {});
  const human = world.addHuman(`encounter-${i}`, "Hero", "nova");
  let nearest = Infinity;
  for (const snake of world.snakes.values()) {
    if (snake.id === human.id || !snake.alive) continue;
    nearest = Math.min(nearest, Math.hypot(snake.x - human.x, snake.y - human.y));
  }
  assert.ok(nearest <= 1700, `first human should spawn near activity; nearest=${nearest}`);
}

const clientSource = fs.readFileSync(new URL("../src/client/gameClient.ts", import.meta.url), "utf8");
const rendererSource = fs.readFileSync(new URL("../src/client/rendering/renderer.ts", import.meta.url), "utf8");
assert.match(clientSource, /CONFIG\.CLIENT_INPUT_SEND_INTERVAL_MS/);
assert.match(clientSource, /CONFIG\.LIVE_INTERPOLATION_DELAY_MS/);
assert.doesNotMatch(clientSource, /now\s*-\s*96/);
assert.doesNotMatch(clientSource, /lastInputSend\s*<\s*30/);
assert.match(rendererSource, /CONFIG\.LIVE_CAMERA_FOLLOW_RATE/);

console.log("Gameplay regression suite passed");
