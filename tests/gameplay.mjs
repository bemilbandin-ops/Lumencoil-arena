import assert from "node:assert/strict";
import { CONFIG } from "../dist/shared/config.js";
import { combatLevel, resolveBodyContact, resolveHeadContact } from "../dist/shared/combat.js";
import { GameWorld } from "../dist/server/game.js";

assert.ok(CONFIG.ARENA_RADIUS <= 1650, `arena radius must be tightly populated; got ${CONFIG.ARENA_RADIUS}`);
assert.ok(CONFIG.SPAWN_SAFE_RADIUS <= 300, `safe radius must fit 24 snakes without central fallback; got ${CONFIG.SPAWN_SAFE_RADIUS}`);

assert.ok(combatLevel(60) > combatLevel(45));
assert.equal(resolveHeadContact(60, 45), "attacker", "higher level can eat a lower-level head");
assert.equal(resolveHeadContact(45, 60), "defender", "higher defender can eat the lower attacker head");
assert.equal(resolveHeadContact(50, 50), "none", "equal-level heads do not mutually die");
assert.equal(resolveBodyContact(60, 45), "attacker", "higher level may eat lower body pieces");
assert.equal(resolveBodyContact(45, 60), "none", "lower level touching higher body does not die");
assert.equal(resolveBodyContact(50, 50), "none", "equal level cannot eat body pieces");

function duelWorld() {
  const world = new GameWorld(() => {});
  const human = world.addHuman("duel-human", "Hero", "nova");
  const bot = [...world.snakes.values()].find(s => s.isBot);
  assert.ok(bot);
  for (const [id, snake] of [...world.snakes]) if (snake !== human && snake !== bot) world.snakes.delete(id);
  const old = Date.now() - CONFIG.SPAWN_PROTECTION_MS - 100;
  human.spawnedAt = old;
  bot.spawnedAt = old;
  human.boost = false;
  bot.boost = false;
  return { world, human, bot, now: Date.now() };
}

{
  const { world, human, bot, now } = duelWorld();
  human.mass = 60;
  bot.mass = 45;
  human.x = 0; human.y = 0; human.body[0] = { x: 0, y: 0 };
  bot.x = 500; bot.y = 0;
  bot.body = [
    { x: 500, y: 0 },
    { x: 487, y: 0 },
    { x: 474, y: 0 },
    { x: 0, y: 0 },
    { x: -13, y: 0 },
    { x: -26, y: 0 }
  ];
  const originalBody = bot.body.map(p => ({ ...p }));
  const massBefore = bot.mass;
  const foodsBefore = world.foods.size;

  world.rebuildGrids(now);
  world.resolveCollisions(now);

  const severed = originalBody.slice(3);
  assert.equal(bot.alive, true, "middle-body cut must not kill victim before head is eaten");
  assert.deepEqual(bot.body, originalBody.slice(0, 3), "middle hit keeps the exact head-side prefix and cuts off the entire tail-side suffix");
  assert.equal(world.foods.size, foodsBefore + severed.length, "every severed tail segment becomes exactly one ground pickup");
  assert.equal(bot.mass, massBefore - severed.length * CONFIG.SNAKE_SEGMENT_MASS, "victim loses mass for every severed segment");
  for (const piece of severed) {
    const matches = [...world.foods.values()].filter(f => f.kind === 2 && Math.abs(f.x - piece.x) < .001 && Math.abs(f.y - piece.y) < .001);
    assert.equal(matches.length, 1, `severed segment at ${piece.x},${piece.y} drops exactly one pickup at that position`);
  }

  // Staying overlapped cannot repeatedly cut during the bite cooldown.
  human.x = 487; human.y = 0; human.body[0] = { x: 487, y: 0 };
  world.rebuildGrids(now + 1);
  world.resolveCollisions(now + 1);
  assert.deepEqual(bot.body, originalBody.slice(0, 3), "bite cooldown prevents a second cut in the same instant");

  // A later bite closer to the head cuts the remaining body suffix, but the head itself still lives.
  world.rebuildGrids(now + CONFIG.SNAKE_BITE_INTERVAL_MS + 1);
  world.resolveCollisions(now + CONFIG.SNAKE_BITE_INTERVAL_MS + 1);
  assert.equal(bot.alive, true, "snake with only its head remaining is still alive");
  assert.deepEqual(bot.body, [originalBody[0]], "near-head body bite severs every remaining body segment behind the head");
  assert.equal(world.foods.size, foodsBefore + originalBody.length - 1, "all five severed body segments became five pickups total");

  // Only an actual head contact finishes the snake.
  human.x = bot.x; human.y = bot.y; human.body[0] = { x: bot.x, y: bot.y };
  world.resolveCollisions(now + CONFIG.SNAKE_BITE_INTERVAL_MS * 2 + 2);
  assert.equal(world.snakes.has(bot.id), false, "only eating the head kills the lower-level snake");
  assert.equal(human.kills, 1, "head eat awards kill credit");
}

{
  const { world, human, bot, now } = duelWorld();
  human.mass = 45;
  bot.mass = 60;
  human.x = 0; human.y = 0; human.body[0] = { x: 0, y: 0 };
  bot.x = 500; bot.y = 0;
  bot.body = [{ x:500,y:0 }, { x:487,y:0 }, { x:0,y:0 }, { x:461,y:0 }];
  const before = bot.body.length;
  world.rebuildGrids(now);
  world.resolveCollisions(now);
  assert.equal(human.alive, true, "lower-level snake is rejected by stronger body instead of dying");
  assert.equal(bot.body.length, before, "stronger body is not eaten by lower-level head");
}

{
  const { world, human, bot, now } = duelWorld();
  human.mass = 60;
  bot.mass = 45;
  human.x = bot.x = 0; human.y = bot.y = 0;
  human.body[0] = { x:0,y:0 }; bot.body[0] = { x:0,y:0 };
  const remainingParts = bot.body.length;
  const foodsBefore = world.foods.size;
  world.resolveCollisions(now);
  assert.equal(human.alive, true, "higher-level head survives eating lower head");
  assert.equal(world.snakes.has(bot.id), false, "victim only dies when head is eaten");
  assert.equal(human.kills, 1, "head eat awards kill credit");
  assert.equal(world.foods.size, foodsBefore + remainingParts, "head death drops exactly one pickup per remaining snake part");
}

{
  const { world, human, bot, now } = duelWorld();
  human.mass = bot.mass = 50;
  human.x = bot.x = 0; human.y = bot.y = 0;
  human.body[0] = { x:0,y:0 }; bot.body[0] = { x:0,y:0 };
  world.resolveCollisions(now);
  assert.equal(human.alive, true, "equal-level head contact is nonlethal");
  assert.equal(bot.alive, true, "equal-level opponent also remains alive");
}

// Seeded spawn distribution: the initial bot fill must not collapse into a central fallback pile.
{
  let state = 0x12345678;
  const realRandom = Math.random;
  Math.random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) / 4294967296); };
  try {
    const world = new GameWorld(() => {});
    const bots = [...world.snakes.values()];
    let minPair = Infinity;
    for (let i=0;i<bots.length;i++) for (let j=i+1;j<bots.length;j++) minPair = Math.min(minPair, Math.hypot(bots[i].x-bots[j].x, bots[i].y-bots[j].y));
    assert.ok(minPair >= 200, `initial bot population must be spatially spread; closest pair=${minPair}`);
    const central = bots.filter(b => Math.hypot(b.x,b.y) < 450).length;
    assert.ok(central <= 5, `bots must not camp in a central spawn pile; central count=${central}`);
  } finally { Math.random = realRandom; }
}

console.log("Snake Clash gameplay regression suite passed");
