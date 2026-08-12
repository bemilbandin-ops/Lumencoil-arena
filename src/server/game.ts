import { CONFIG, SKINS } from "../shared/config.js";
import { resolveBodyContact, resolveHeadContact } from "../shared/combat.js";
import {
  clamp, distanceSq, normalizeAngle,
  type BotProfile, type DeathStats, type FoodSnapshot, type LeaderboardEntry,
  type SnapshotMessage, type SnakeSnapshot, type Vec2, type WorldEvent
} from "../shared/types.js";
import { createBrain, decideBot, type BotBrain, type BotBody, type BotFood, type BotSnake } from "./botAI.js";
import { SpatialHash } from "./spatialHash.js";

type Food = FoodSnapshot & { bornAt: number };
type BodyCell = BotBody & { segmentIndex: number };

export type Snake = BotSnake & {
  nickname: string;
  isBot: boolean;
  connectionId?: string;
  disconnectedAt?: number;
  skin: string;
  targetAngle: number;
  boost: boolean;
  score: number;
  kills: number;
  spawnedAt: number;
  body: Vec2[];
  brain?: BotBrain;
  lastInputAt: number;
  lastSeq: number;
  deathStats?: DeathStats;
};

const BOT_NAMES = [
  "OrbitMoth", "VelvetByte", "MisoComet", "DustPilot", "MintRiot", "EchoLynx", "TinyMeteor", "NullPanda",
  "StaticBloom", "NoodleKing", "PixelMara", "BriskOtter", "LaserFern", "MoonCrumb", "SoftHex", "TurboMoss",
  "CloudBite", "RookNova", "CitrusLoop", "SpareMoon", "WispDrive", "ByteBadger", "JellyVolt", "LuckyQuark",
  "NeonKite", "DriftBean", "PlasmaYak", "QuietRaven", "CosmicFig", "SnackGhost", "RiftFox", "AquaMantis",
  "IonToast", "MellowBug", "PrismCrow", "WaffleRay", "GlitchPup", "VaporMink", "OrbitPlum", "KiloFrog"
];
const PROFILES: BotProfile[] = ["PASSIVE", "NORMAL", "AGGRESSIVE", "GREEDY", "CAUTIOUS"];

function rand(min: number, max: number): number { return min + Math.random() * (max - min); }
function choose<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }

export class GameWorld {
  readonly snakes = new Map<string, Snake>();
  readonly foods = new Map<number, Food>();
  private nextFoodId = 1;
  private nextSnakeId = 1;
  private nextEventId = 1;
  private readonly foodGrid = new SpatialHash<Food>(CONFIG.FOOD_GRID_SIZE);
  private readonly bodyGrid = new SpatialHash<BodyCell>(CONFIG.SNAKE_GRID_SIZE);
  private events: WorldEvent[] = [];
  private readonly onHumanDeath: (connectionId: string | undefined, snakeId: string, stats: DeathStats) => void;

  constructor(onHumanDeath: (connectionId: string | undefined, snakeId: string, stats: DeathStats) => void) {
    this.onHumanDeath = onHumanDeath;
    for (let i = 0; i < CONFIG.FOOD_AMBIENT_TARGET; i++) this.spawnAmbientFood();
    this.ensurePopulation();
  }

  addHuman(connectionId: string, nickname: string, skin: string): Snake {
    const existing = this.getHumanByConnection(connectionId);
    if (existing) return existing;
    const active = this.activePopulation();
    const bot = this.chooseBotForReplacement();
    if (active >= CONFIG.MAX_ROOM_POPULATION && !bot) throw new Error("Arena is full");
    if (active >= CONFIG.TARGET_ROOM_POPULATION && bot) this.removeSnake(bot.id, false);
    const snake = this.createSnake(false, connectionId, nickname, skin);
    this.snakes.set(snake.id, snake);
    this.emit({ type: "spawn", snakeId: snake.id, x: snake.x, y: snake.y, skin: snake.skin });
    this.ensurePopulation();
    return snake;
  }

  reattachHuman(snakeId: string, connectionId: string): Snake | null {
    const snake = this.snakes.get(snakeId);
    if (!snake || snake.isBot) return null;
    snake.connectionId = connectionId;
    snake.disconnectedAt = undefined;
    snake.lastInputAt = 0;
    snake.lastSeq = 0;
    return snake;
  }

  detachHuman(connectionId: string): Snake | null {
    const snake = this.getHumanByConnection(connectionId);
    if (!snake) return null;
    snake.connectionId = undefined;
    snake.disconnectedAt = Date.now();
    snake.boost = false;
    snake.targetAngle = snake.angle;
    return snake;
  }

  expireHuman(snakeId: string): void {
    const snake = this.snakes.get(snakeId);
    if (!snake || snake.isBot || snake.connectionId) return;
    this.removeSnake(snakeId, snake.alive);
    this.ensurePopulation();
  }

  removeHuman(connectionId: string): void {
    const snake = this.getHumanByConnection(connectionId);
    if (snake) this.removeSnake(snake.id, snake.alive);
    this.ensurePopulation();
  }

  respawnHuman(connectionId: string): Snake | null {
    const snake = this.getHumanByConnection(connectionId);
    if (!snake) return null;
    if (snake.alive) return snake;
    if (this.activePopulation() >= CONFIG.TARGET_ROOM_POPULATION) {
      const bot = this.chooseBotForReplacement();
      if (bot) this.removeSnake(bot.id, false);
    }
    const fresh = this.spawnPoint(true);
    snake.x = fresh.x;
    snake.y = fresh.y;
    snake.angle = rand(-Math.PI, Math.PI);
    snake.targetAngle = snake.angle;
    snake.mass = CONFIG.START_MASS;
    snake.score = 0;
    snake.kills = 0;
    snake.boost = false;
    snake.alive = true;
    snake.spawnedAt = Date.now();
    snake.body = this.makeInitialBody(snake.x, snake.y, snake.angle);
    snake.lastSeq = 0;
    snake.deathStats = undefined;
    this.emit({ type: "spawn", snakeId: snake.id, x: snake.x, y: snake.y, skin: snake.skin });
    this.ensurePopulation();
    return snake;
  }

  applyHumanInput(connectionId: string, seq: number, angle: number, boost: boolean, now: number): void {
    const snake = this.getHumanByConnection(connectionId);
    if (!snake || !snake.alive || !Number.isFinite(angle) || !Number.isSafeInteger(seq)) return;
    if (seq <= snake.lastSeq || seq - snake.lastSeq > CONFIG.MAX_INPUT_SEQ_JUMP) return;
    if (now - snake.lastInputAt < CONFIG.INPUT_MIN_INTERVAL_MS) return;
    snake.lastInputAt = now;
    snake.lastSeq = seq;
    snake.targetAngle = normalizeAngle(angle);
    snake.boost = Boolean(boost);
  }

  tick(dt: number): void {
    const now = Date.now();
    this.rebuildGrids(now);
    for (const snake of this.snakes.values()) {
      if (snake.alive && snake.isBot) this.updateBot(snake, dt);
    }
    for (const snake of this.snakes.values()) {
      if (snake.alive) this.moveSnake(snake, dt);
    }
    this.rebuildGrids(now);
    this.resolveFood();
    this.resolveCollisions(now);
    this.maintainFood(now);
    this.pruneEvents(now);
    this.ensurePopulation();
  }

  snapshotFor(connectionId: string): SnapshotMessage | null {
    const me = this.getHumanByConnection(connectionId);
    if (!me) return null;
    const leaderboard = this.getLeaderboard();
    const rank = leaderboard.findIndex(e => e.id === me.id) + 1 || leaderboard.length + 1;
    const snakes: SnakeSnapshot[] = [];
    const snakeRange2 = CONFIG.SNAPSHOT_SNAKE_RADIUS * CONFIG.SNAPSHOT_SNAKE_RADIUS;
    const now = Date.now();
    for (const s of this.snakes.values()) {
      if (!s.alive || (s.id !== me.id && distanceSq(s, me) > snakeRange2)) continue;
      const stride = s.body.length > 145 ? 3 : s.body.length > 85 ? 2 : 1;
      const body: Vec2[] = [];
      for (let i = 0; i < s.body.length; i += stride) {
        const p = s.body[i]!;
        body.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
      }
      snakes.push({
        id: s.id, nickname: s.nickname, skin: s.skin,
        mass: round1(s.mass), score: Math.round(s.score), kills: s.kills,
        angle: round3(s.angle), boost: s.boost,
        protected: now - s.spawnedAt < CONFIG.SPAWN_PROTECTION_MS,
        body
      });
    }
    const foods = this.foodGrid.query(me.x, me.y, CONFIG.SNAPSHOT_FOOD_RADIUS)
      .filter(f => this.foods.has(f.id) && distanceSq(f, me) <= CONFIG.SNAPSHOT_FOOD_RADIUS * CONFIG.SNAPSHOT_FOOD_RADIUS)
      .map(f => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), value: f.value, kind: f.kind }));
    const eventRange2 = CONFIG.EVENT_VISIBILITY_RADIUS * CONFIG.EVENT_VISIBILITY_RADIUS;
    const events = this.events.filter(event => distanceSq(event, me) <= eventRange2 || (event.type !== "collect" && event.snakeId === me.id));
    return {
      type: "snapshot",
      serverTime: now,
      snakes,
      foods,
      leaderboard: leaderboard.slice(0, 10),
      you: {
        score: Math.round(me.score), mass: round1(me.mass), rank,
        kills: me.kills, survivalSeconds: me.alive ? Math.max(0, Math.floor((now - me.spawnedAt) / 1000)) : me.deathStats?.survivalSeconds ?? 0
      },
      events
    };
  }

  getHumanByConnection(connectionId: string): Snake | undefined {
    for (const s of this.snakes.values()) if (!s.isBot && s.connectionId === connectionId) return s;
    return undefined;
  }

  getSnake(id: string): Snake | undefined { return this.snakes.get(id); }

  getLeaderboard(): LeaderboardEntry[] {
    return [...this.snakes.values()]
      .filter(s => s.alive)
      .sort((a, b) => b.score - a.score || b.mass - a.mass)
      .map(s => ({ id: s.id, nickname: s.nickname, score: Math.round(s.score) }));
  }

  debugCounts(): { humans: number; bots: number; active: number; foods: number } {
    let humans = 0, bots = 0, active = 0;
    for (const s of this.snakes.values()) {
      if (s.isBot) bots++; else humans++;
      if (s.alive) active++;
    }
    return { humans, bots, active, foods: this.foods.size };
  }

  private createSnake(isBot: boolean, connectionId?: string, nickname?: string, skin?: string): Snake {
    const p = this.spawnPoint(!isBot);
    const angle = rand(-Math.PI, Math.PI);
    const profile = choose(PROFILES);
    const mass = CONFIG.START_MASS + (isBot ? rand(0, 26) : 0);
    return {
      id: `s${this.nextSnakeId++}`,
      nickname: nickname?.trim().slice(0, 18) || (isBot ? `${choose(BOT_NAMES)}${Math.floor(rand(1, 99))}` : "Player"),
      isBot, connectionId,
      skin: SKINS.some(s => s.id === skin) ? skin! : choose(SKINS).id,
      x: p.x, y: p.y, angle, targetAngle: angle, boost: false,
      mass, score: isBot ? Math.max(0, Math.round((mass - CONFIG.START_MASS) * 2.2)) : 0,
      kills: 0, alive: true, spawnedAt: Date.now(),
      body: this.makeInitialBody(p.x, p.y, angle, mass), lastInputAt: 0, lastSeq: 0,
      brain: isBot ? createBrain(profile) : undefined
    };
  }

  private makeInitialBody(x: number, y: number, angle: number, mass: number = CONFIG.START_MASS): Vec2[] {
    const body: Vec2[] = [];
    const segments = this.targetSegments(mass);
    for (let i = 0; i < segments; i++) body.push({ x: x - Math.cos(angle) * i * CONFIG.SEGMENT_SPACING, y: y - Math.sin(angle) * i * CONFIG.SEGMENT_SPACING });
    return body;
  }

  private spawnPoint(preferNearHuman = false): Vec2 {
    const humans = preferNearHuman
      ? [...this.snakes.values()].filter(s => !s.isBot && s.alive && s.connectionId)
      : [];
    const encounterAnchors = preferNearHuman && !humans.length
      ? [...this.snakes.values()].filter(s => s.alive)
      : humans;
    for (let attempt = 0; attempt < 48; attempt++) {
      let p: Vec2;
      if (encounterAnchors.length && attempt < 30) {
        const anchor = choose(encounterAnchors);
        const a = rand(-Math.PI, Math.PI);
        const d = rand(820, 1500);
        p = { x: anchor.x + Math.cos(a) * d, y: anchor.y + Math.sin(a) * d };
        const center = Math.hypot(p.x, p.y);
        const maxR = CONFIG.ARENA_RADIUS - CONFIG.SPAWN_EDGE_PADDING;
        if (center > maxR) {
          p.x *= maxR / center;
          p.y *= maxR / center;
        }
      } else {
        const a = rand(-Math.PI, Math.PI);
        const r = Math.sqrt(Math.random()) * (CONFIG.ARENA_RADIUS - CONFIG.SPAWN_EDGE_PADDING);
        p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
      let safe = true;
      for (const s of this.snakes.values()) {
        if (s.alive && distanceSq(p, s) < CONFIG.SPAWN_SAFE_RADIUS * CONFIG.SPAWN_SAFE_RADIUS) { safe = false; break; }
      }
      if (safe) return p;
    }
    return { x: rand(-1000, 1000), y: rand(-1000, 1000) };
  }

  private activePopulation(): number {
    let count = 0;
    for (const s of this.snakes.values()) if (s.alive) count++;
    return count;
  }

  private ensurePopulation(): void {
    while (this.activePopulation() < CONFIG.TARGET_ROOM_POPULATION) {
      const bot = this.createSnake(true);
      this.snakes.set(bot.id, bot);
      this.emit({ type: "spawn", snakeId: bot.id, x: bot.x, y: bot.y, skin: bot.skin });
    }
    while (this.activePopulation() > CONFIG.MAX_ROOM_POPULATION) {
      const bot = this.chooseBotForReplacement();
      if (!bot) break;
      this.removeSnake(bot.id, false);
    }
  }

  private chooseBotForReplacement(): Snake | undefined {
    const bots = [...this.snakes.values()].filter(s => s.isBot && s.alive);
    if (!bots.length) return undefined;
    const humans = [...this.snakes.values()].filter(s => !s.isBot && s.alive && s.connectionId);
    if (!humans.length) return bots[0];
    let best = bots[0]!;
    let bestDistance = -1;
    for (const bot of bots) {
      let nearest = Infinity;
      for (const human of humans) nearest = Math.min(nearest, distanceSq(bot, human));
      if (nearest > bestDistance) { bestDistance = nearest; best = bot; }
    }
    return best;
  }

  private removeSnake(id: string, dropFood: boolean): void {
    const snake = this.snakes.get(id);
    if (!snake) return;
    if (dropFood && snake.alive) this.dropDeathFood(snake);
    this.snakes.delete(id);
  }

  private moveSnake(s: Snake, dt: number): void {
    const turnPenalty = clamp(1 - (s.mass - CONFIG.START_MASS) * CONFIG.MASS_TURN_PENALTY, .54, 1);
    const maxTurn = CONFIG.TURN_RATE * turnPenalty * dt;
    const delta = normalizeAngle(s.targetAngle - s.angle);
    s.angle = normalizeAngle(s.angle + clamp(delta, -maxTurn, maxTurn));
    const canBoost = s.boost && s.mass > CONFIG.MIN_BOOST_MASS;
    if (s.boost && !canBoost) s.boost = false;
    const massPenalty = clamp((s.mass - CONFIG.START_MASS) * CONFIG.MASS_SPEED_PENALTY, 0, 35);
    const speed = Math.max(92, (canBoost ? CONFIG.BOOST_SPEED : CONFIG.BASE_SPEED) - massPenalty);
    if (canBoost) s.mass = Math.max(CONFIG.MIN_BOOST_MASS, s.mass - CONFIG.BOOST_DRAIN_PER_SECOND * dt);
    s.x += Math.cos(s.angle) * speed * dt;
    s.y += Math.sin(s.angle) * speed * dt;
    s.body[0]!.x = s.x;
    s.body[0]!.y = s.y;

    const targetSegments = this.targetSegments(s.mass);
    while (s.body.length < targetSegments) s.body.push({ ...s.body[s.body.length - 1]! });
    while (s.body.length > targetSegments) s.body.pop();
    for (let i = 1; i < s.body.length; i++) {
      const prev = s.body[i - 1]!;
      const cur = s.body[i]!;
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const d = Math.hypot(dx, dy) || .001;
      const desiredX = prev.x + dx / d * CONFIG.SEGMENT_SPACING;
      const desiredY = prev.y + dy / d * CONFIG.SEGMENT_SPACING;
      cur.x += (desiredX - cur.x) * .92;
      cur.y += (desiredY - cur.y) * .92;
    }
  }

  private targetSegments(mass: number): number {
    return Math.round(clamp(CONFIG.START_SEGMENTS + (mass - CONFIG.START_MASS) / 2.15, CONFIG.START_SEGMENTS, CONFIG.MAX_BODY_SEGMENTS));
  }

  private rebuildGrids(now: number): void {
    this.foodGrid.clear();
    for (const f of this.foods.values()) this.foodGrid.insert(f);
    this.bodyGrid.clear();
    for (const s of this.snakes.values()) {
      if (!s.alive || now - s.spawnedAt < CONFIG.SPAWN_PROTECTION_MS) continue;
      for (let i = 2; i < s.body.length; i++) {
        const p = s.body[i]!;
        this.bodyGrid.insert({ x: p.x, y: p.y, snakeId: s.id, segmentIndex: i });
      }
    }
  }

  private resolveFood(): void {
    const eaten = new Set<number>();
    for (const s of this.snakes.values()) {
      if (!s.alive) continue;
      const nearby = this.foodGrid.query(s.x, s.y, CONFIG.FOOD_PICKUP_RADIUS + 16);
      for (const f of nearby) {
        if (eaten.has(f.id)) continue;
        const r = CONFIG.FOOD_PICKUP_RADIUS + f.value * 1.45;
        if (distanceSq(s, f) > r * r) continue;
        eaten.add(f.id);
        s.mass += f.value * CONFIG.GROWTH_MASS_PER_FOOD_VALUE;
        s.score += f.value * CONFIG.SCORE_FOOD_MULTIPLIER;
        this.emit({ type: "collect", eaterId: s.id, x: f.x, y: f.y, value: f.value, kind: f.kind });
      }
    }
    for (const id of eaten) this.foods.delete(id);
  }

  private resolveCollisions(now: number): void {
    const dead = new Map<string, string | null>();
    const alive = [...this.snakes.values()].filter(s => s.alive);
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i]!;
      if (dead.has(a.id)) continue;
      const protectedA = now - a.spawnedAt < CONFIG.SPAWN_PROTECTION_MS;
      if (!protectedA && Math.hypot(a.x, a.y) > CONFIG.ARENA_RADIUS - CONFIG.HEAD_RADIUS * 1.45) { dead.set(a.id, null); continue; }
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j]!;
        if (dead.has(b.id) || protectedA || now - b.spawnedAt < CONFIG.SPAWN_PROTECTION_MS) continue;
        const r = CONFIG.HEAD_RADIUS * 1.82;
        if (distanceSq(a, b) > r * r) continue;
        const outcome = resolveHeadContact(a.mass, b.mass);
        if (outcome === "attacker") dead.set(b.id, a.id);
        else if (outcome === "defender") dead.set(a.id, b.id);
        else {
          dead.set(a.id, null);
          dead.set(b.id, null);
        }
      }
    }
    for (const s of alive) {
      if (dead.has(s.id) || now - s.spawnedAt < CONFIG.SPAWN_PROTECTION_MS) continue;
      const nearby = this.bodyGrid.query(s.x, s.y, CONFIG.HEAD_RADIUS + CONFIG.BODY_RADIUS + 10);
      for (const p of nearby) {
        if (p.snakeId === s.id) continue;
        const r = CONFIG.HEAD_RADIUS + CONFIG.BODY_RADIUS * .75;
        if (distanceSq(s, p) > r * r) continue;
        const owner = this.snakes.get(p.snakeId);
        if (!owner?.alive || dead.has(owner.id)) continue;
        if (resolveBodyContact(s.mass, owner.mass) === "attacker") dead.set(owner.id, s.id);
        else dead.set(s.id, owner.id);
        break;
      }
    }
    for (const [id, killerId] of dead) this.killSnake(id, killerId);
  }

  private killSnake(id: string, killerId: string | null): void {
    const snake = this.snakes.get(id);
    if (!snake || !snake.alive) return;
    snake.alive = false;
    snake.boost = false;
    const stats: DeathStats = {
      score: Math.round(snake.score), mass: round1(snake.mass),
      survivalSeconds: Math.max(0, Math.round((Date.now() - snake.spawnedAt) / 1000)), kills: snake.kills
    };
    snake.deathStats = stats;
    this.emit({ type: "death", snakeId: snake.id, killerId, x: snake.x, y: snake.y, skin: snake.skin, mass: snake.mass });
    this.dropDeathFood(snake);
    if (killerId && killerId !== id) {
      const killer = this.snakes.get(killerId);
      if (killer?.alive) { killer.kills++; killer.score += CONFIG.SCORE_KILL_BONUS; }
    }
    if (snake.isBot) {
      this.snakes.delete(snake.id);
    } else {
      this.onHumanDeath(snake.connectionId, snake.id, stats);
    }
  }

  private dropDeathFood(s: Snake): void {
    let remaining = Math.max(12, s.mass * CONFIG.DEAD_FOOD_KEEP_RATIO);
    const points = s.body.length;
    let cursor = 0;
    while (remaining > .5 && cursor < points * 2 && this.foods.size < CONFIG.FOOD_MAX) {
      const p = s.body[Math.min(points - 1, Math.floor(cursor / 2))]!;
      const value = Math.min(remaining, Math.random() < .14 ? 4 : Math.random() < .34 ? 3 : 2);
      this.spawnFood(p.x + rand(-20, 20), p.y + rand(-20, 20), Math.max(1, Math.round(value)), 2);
      remaining -= value;
      cursor++;
    }
  }

  private maintainFood(now: number): void {
    while (this.foods.size < CONFIG.FOOD_AMBIENT_TARGET) this.spawnAmbientFood();
    if (this.foods.size > CONFIG.FOOD_MAX) {
      const trim = this.foods.size - CONFIG.FOOD_MAX;
      const oldest = [...this.foods.values()].sort((a, b) => a.bornAt - b.bornAt).slice(0, trim);
      for (const f of oldest) this.foods.delete(f.id);
    }
    for (const f of this.foods.values()) {
      if (f.kind === 2 && now - f.bornAt > CONFIG.DEAD_FOOD_LIFETIME_MS) this.foods.delete(f.id);
    }
  }

  private spawnAmbientFood(): void {
    const a = rand(-Math.PI, Math.PI);
    const r = Math.sqrt(Math.random()) * (CONFIG.ARENA_RADIUS - 90);
    const rare = Math.random() < CONFIG.FOOD_RARE_CHANCE;
    this.spawnFood(Math.cos(a) * r, Math.sin(a) * r, rare ? choose([3, 4, 4, 5]) : choose([1, 1, 1, 1, 2, 2]), rare ? 1 : 0);
  }

  private spawnFood(x: number, y: number, value: number, kind: number): void {
    const f: Food = { id: this.nextFoodId++, x, y, value, kind, bornAt: Date.now() };
    this.foods.set(f.id, f);
  }

  private updateBot(s: Snake, dt: number): void {
    const brain = s.brain!;
    brain.timer -= dt;
    if (brain.timer > 0) return;
    brain.timer = brain.reaction;
    const look = CONFIG.BOT_VIEW_DISTANCE + (brain.profile === "CAUTIOUS" ? 160 : 0);
    const bodies = this.bodyGrid.query(s.x, s.y, look);
    const foods: BotFood[] = this.foodGrid.query(s.x, s.y, look);
    const snakes: BotSnake[] = [];
    const look2 = look * look;
    for (const other of this.snakes.values()) {
      if (other.alive && distanceSq(s, other) <= look2) snakes.push(other);
    }
    const decision = decideBot(s, brain, bodies, foods, snakes);
    s.targetAngle = normalizeAngle(decision.angle);
    s.boost = decision.boost;
  }

  private emit(event: any): void {
    const full = { ...event, id: this.nextEventId++, at: Date.now() } as WorldEvent;
    this.events.push(full);
    if (this.events.length > CONFIG.MAX_EVENTS) this.events.splice(0, this.events.length - CONFIG.MAX_EVENTS);
  }

  private pruneEvents(now: number): void {
    const cutoff = now - CONFIG.EVENT_RETENTION_MS;
    let index = 0;
    while (index < this.events.length && this.events[index]!.at < cutoff) index++;
    if (index > 0) this.events.splice(0, index);
  }
}

function round1(v: number): number { return Math.round(v * 10) / 10; }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }
