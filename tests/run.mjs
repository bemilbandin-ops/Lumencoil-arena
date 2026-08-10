import assert from "node:assert/strict";
import { SpatialHash } from "../dist/server/spatialHash.js";
import { createBrain, decideBot } from "../dist/server/botAI.js";
import { normalizeAngle, distanceSq } from "../dist/shared/types.js";
import { CONFIG } from "../dist/shared/config.js";
import { GameWorld } from "../dist/server/game.js";

const grid = new SpatialHash(100);
grid.insert({ x: 10, y: 20, id: "a" });
grid.insert({ x: 260, y: 20, id: "b" });
assert.equal(grid.query(0, 0, 80).length, 1, "spatial hash nearby query");
assert.equal(grid.query(250, 0, 80).length, 1, "spatial hash distant bucket query");
assert.ok(Math.abs(normalizeAngle(Math.PI * 3) - Math.PI) < 1e-9, "angle normalization");
assert.equal(distanceSq({ x: 0, y: 0 }, { x: 3, y: 4 }), 25, "distance math");

const aggressive = createBrain("AGGRESSIVE");
const cautious = createBrain("CAUTIOUS");
assert.ok(aggressive.aggression > cautious.aggression, "bot profiles materially differ");
assert.ok(cautious.risk < aggressive.risk, "cautious bot has lower risk tolerance");

const deaths = [];
const world = new GameWorld((connectionId, snakeId, stats) => deaths.push({ connectionId, snakeId, stats }));
let counts = world.debugCounts();
assert.equal(counts.active, CONFIG.TARGET_ROOM_POPULATION, "room starts at target population");
assert.equal(counts.bots, CONFIG.TARGET_ROOM_POPULATION, "room starts bot-filled");
assert.ok(counts.foods >= CONFIG.FOOD_AMBIENT_TARGET, "ambient food is populated");

const human = world.addHuman("test-connection", "Tester", "nova");
counts = world.debugCounts();
assert.equal(counts.humans, 1, "human joins");
assert.equal(counts.active, CONFIG.TARGET_ROOM_POPULATION, "bot yields slot to human");
assert.equal(counts.bots, CONFIG.TARGET_ROOM_POPULATION - 1, "one bot replaced by human");

const initialAngle = human.targetAngle;
world.applyHumanInput("test-connection", 1, Math.PI / 2, true, 1000);
assert.equal(human.lastSeq, 1, "valid input sequence accepted");
assert.notEqual(human.targetAngle, initialAngle, "steering intent applied");
const acceptedAngle = human.targetAngle;
world.applyHumanInput("test-connection", 1, -Math.PI / 2, false, 1100);
assert.equal(human.targetAngle, acceptedAngle, "duplicate input sequence rejected");
world.applyHumanInput("test-connection", 2, -Math.PI / 2, true, 1200);
assert.equal(human.lastSeq, 2, "newer input sequence accepted");

world.foods.clear();
const massBeforeBoost = human.mass;
world.tick(.2);
assert.ok(human.mass < massBeforeBoost, "boost consumes mass when no food is collected");
assert.ok(Number.isFinite(human.x) && Number.isFinite(human.y), "simulation advances without invalid positions");

const detached = world.detachHuman("test-connection");
assert.equal(detached?.id, human.id, "disconnect detaches human for reconnection");
assert.equal(world.getHumanByConnection("test-connection"), undefined, "detached connection is no longer active");
const reattached = world.reattachHuman(human.id, "new-connection");
assert.equal(reattached?.id, human.id, "reconnect restores the same snake");
assert.equal(world.getHumanByConnection("new-connection")?.id, human.id, "new connection owns restored snake");

human.x = CONFIG.ARENA_RADIUS + 300;
human.y = 0;
human.body[0].x = human.x;
human.body[0].y = human.y;
human.spawnedAt = Date.now() - CONFIG.SPAWN_PROTECTION_MS - 100;
world.tick(.05);
assert.equal(human.alive, false, "server-authoritative boundary collision kills human");
assert.equal(deaths.length, 1, "human death callback fired");
counts = world.debugCounts();
assert.equal(counts.active, CONFIG.TARGET_ROOM_POPULATION, "dead human slot is filled by bot");
assert.equal(counts.bots, CONFIG.TARGET_ROOM_POPULATION, "bot fills dead human active slot");
assert.ok(world.foods.size > CONFIG.FOOD_AMBIENT_TARGET, "death creates collectible food trail");

world.respawnHuman("new-connection");
counts = world.debugCounts();
assert.equal(human.alive, true, "human respawns without page reload");
assert.equal(counts.active, CONFIG.TARGET_ROOM_POPULATION, "respawn yields a bot slot");
assert.equal(counts.bots, CONFIG.TARGET_ROOM_POPULATION - 1, "respawn removes replacement bot");

world.removeHuman("new-connection");
counts = world.debugCounts();
assert.equal(counts.humans, 0, "intentional leave cleans human record");
assert.equal(counts.bots, CONFIG.TARGET_ROOM_POPULATION, "bot replenishes vacated slot");
assert.equal(counts.active, CONFIG.TARGET_ROOM_POPULATION, "target population preserved after leave");

// Bot behavior acceptance: danger avoidance, food collection, death/replacement.
const aiBrain = createBrain("CAUTIOUS");
const self = { id: "self", x: 0, y: 0, angle: 0, mass: 50, alive: true, boost: false };
const avoidance = decideBot(self, aiBrain, [{ x: 95, y: 0, snakeId: "enemy" }], [], [self]);
assert.ok(Math.abs(normalizeAngle(avoidance.angle)) > 2.2, "bot steers away from projected body collision");

const botWorld = new GameWorld(() => {});
const eater = [...botWorld.snakes.values()].find(s => s.isBot);
assert.ok(eater, "bot exists for behavior test");
botWorld.foods.clear();
const eaterMass = eater.mass;
botWorld.spawnFood(eater.x, eater.y, 5, 1);
eater.brain.timer = 99;
botWorld.tick(.01);
assert.ok(eater.mass > eaterMass, "server bot collects food under normal rules");
const doomed = [...botWorld.snakes.values()].find(s => s.isBot);
doomed.x = CONFIG.ARENA_RADIUS + 250; doomed.y = 0; doomed.body[0].x = doomed.x; doomed.body[0].y = 0;
doomed.spawnedAt = Date.now() - CONFIG.SPAWN_PROTECTION_MS - 100;
const doomedId = doomed.id;
botWorld.tick(.05);
assert.equal(botWorld.snakes.has(doomedId), false, "bot can die from authoritative collision rules");
assert.equal(botWorld.debugCounts().active, CONFIG.TARGET_ROOM_POPULATION, "dead bot is automatically replaced");

// Room ceiling acceptance: bots yield through 24 humans, then a small configured surge is allowed.
const capacityWorld = new GameWorld(() => {});
for (let i = 0; i < CONFIG.MAX_ROOM_POPULATION; i++) capacityWorld.addHuman(`cap-${i}`, `Human${i}`, "nova");
const capacity = capacityWorld.debugCounts();
assert.equal(capacity.humans, CONFIG.MAX_ROOM_POPULATION, "room accepts humans through configured hard ceiling");
assert.equal(capacity.bots, 0, "bots fully yield when human population reaches target and beyond");
assert.equal(capacity.active, CONFIG.MAX_ROOM_POPULATION, "active population respects configured maximum");
assert.throws(() => capacityWorld.addHuman("overflow", "Overflow", "nova"), /Arena is full/, "human above hard ceiling is rejected");

console.log("All focused game logic tests passed", counts);
