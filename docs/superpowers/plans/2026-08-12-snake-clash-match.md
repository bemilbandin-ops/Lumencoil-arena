# Snake Clash-Style Solo Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the endless shared arena with private, bot-only 90-second matches that end in a level-80 boss fight.

**Architecture:** Keep `GameWorld` as the authoritative simulation and add a small `MatchSession` wrapper for phase timing, results, and reset. Associate each reconnect token with one private match on the server, extend snapshots with match state, and adapt the existing React HUD and canvas labels to present level-based prey, danger, boss, and results.

**Tech Stack:** TypeScript 5.8, Node.js 20, in-repository WebSocket transport, React 16 global runtime, Canvas 2D, Node `assert` tests.

## Global Constraints

- Match duration is exactly 90 seconds: 75 seconds `GROWTH`, then 15 seconds `BOSS`.
- Player starts at level 1 with eight body segments.
- Ambient food grants one level; rare food grants three levels.
- Boss level is exactly 80; player must be level 81 or higher and eat its head to win.
- Existing multiplayer code stays in the repository but is absent from the player-facing path.
- Do not add dependencies or unrelated progression, monetization, skins, audio, or visual redesign.
- Do not include the pre-existing `package-lock.json` working-tree change in any commit.

---

## File Structure

- Create `src/shared/match.ts`: level conversion and shared match constants.
- Create `src/server/matchSession.ts`: private match lifecycle and result ownership.
- Modify `src/shared/config.ts`: solo-match constants and eight-segment start.
- Modify `src/shared/types.ts`: explicit snake level and match snapshot/result types.
- Modify `src/shared/combat.ts`: compare explicit integer levels through the shared helper.
- Modify `src/server/game.ts`: level storage, level food, boss creation, and match-aware bot replacement.
- Modify `src/server/index.ts`: one `MatchSession` per reconnect token instead of one singleton world.
- Modify `src/client/gameClient.ts`: deliver match state and result callbacks; replay creates a fresh match.
- Modify `src/client/app.ts`: level/timer/boss HUD and unified win/defeat result screen.
- Modify `src/client/rendering/snakeRenderer.ts`: prey, neutral, danger, and boss level badges.
- Modify `public/styles.css`: focused solo HUD and result styling.
- Modify `tests/gameplay.mjs`: deterministic level and match lifecycle tests.
- Modify `tests/integration.mjs`: private-world and replay/reconnect transport coverage.

### Task 1: Shared Level and Match Contract

**Files:**
- Create: `src/shared/match.ts`
- Modify: `src/shared/config.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/combat.ts`
- Test: `tests/gameplay.mjs`

**Interfaces:**
- Produces: `levelFromMass(mass: number): number`, `massForLevel(level: number): number`, `MatchPhase`, `MatchResult`, and `MatchSnapshot`.
- Produces: `SnakeSnapshot.level`, `SnakeSnapshot.isBoss`, and `SnapshotMessage.match`.

- [ ] **Step 1: Add failing shared-contract assertions**

Add assertions that levels round-trip, food constants equal one and three, match timing totals 90 seconds, start segments equal eight, and level-based contacts reject equal levels.

```js
assert.equal(levelFromMass(massForLevel(1)), 1);
assert.equal(levelFromMass(massForLevel(81)), 81);
assert.equal(CONFIG.MATCH_GROWTH_MS, 75_000);
assert.equal(CONFIG.MATCH_BOSS_MS, 15_000);
assert.equal(CONFIG.START_SEGMENTS, 8);
assert.equal(resolveHeadContact(massForLevel(81), massForLevel(80)), "attacker");
assert.equal(resolveHeadContact(massForLevel(80), massForLevel(80)), "none");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm run build && node tests/gameplay.mjs`

Expected: module export or missing configuration assertion fails.

- [ ] **Step 3: Implement the shared contract**

Use a single mass increment per level so old movement/body code can remain intact while snapshots expose direct levels.

```ts
export type MatchPhase = "GROWTH" | "BOSS" | "RESULT";
export type MatchResult = "WIN" | "DEFEAT" | null;
export type MatchSnapshot = {
  phase: MatchPhase;
  remainingMs: number;
  result: MatchResult;
  bossId: string | null;
  bossLevel: number | null;
};

export function levelFromMass(mass: number): number {
  return Math.max(1, Math.floor((mass - CONFIG.START_MASS) / CONFIG.LEVEL_MASS_STEP) + 1);
}

export function massForLevel(level: number): number {
  return CONFIG.START_MASS + (Math.max(1, Math.floor(level)) - 1) * CONFIG.LEVEL_MASS_STEP;
}
```

Set `LEVEL_MASS_STEP` to `CONFIG.SNAKE_SEGMENT_MASS`, `START_SEGMENTS` to `8`, and add exact match/food/boss constants. Update combat helpers to compare `levelFromMass` results.

- [ ] **Step 4: Build and run the focused test**

Run: `npm run build && node tests/gameplay.mjs`

Expected: shared-contract assertions pass; existing combat assertions remain green.

### Task 2: Authoritative Match Session

**Files:**
- Create: `src/server/matchSession.ts`
- Modify: `src/server/game.ts`
- Test: `tests/gameplay.mjs`

**Interfaces:**
- Consumes: `MatchSnapshot`, `massForLevel`, and match constants from Task 1.
- Produces: `new MatchSession(connectionId, nickname, skin, now?)`, `tick(dt, now?)`, `snapshotFor(connectionId, now?)`, `applyInput(...)`, `detach(...)`, `reattach(...)`, and `restart(...)`.
- Produces: `GameWorld.createBoss(level: number)` and `GameWorld.setBotReplacementEnabled(enabled: boolean)`.

- [ ] **Step 1: Write deterministic lifecycle tests**

Construct a session at time `1_000`, assert `GROWTH`, tick at `76_000` and assert one level-80 boss in `BOSS`, then tick at `91_001` and assert `DEFEAT`. Force player level 81 onto the boss head, resolve collision, and assert `WIN`. Restart and assert a new level-1 player, reset timer, zero kills, and no boss.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm run build && node tests/gameplay.mjs`

Expected: import of `MatchSession` or lifecycle methods fail.

- [ ] **Step 3: Make GameWorld explicitly level-aware**

Add `level` and `isBoss` to internal snakes, initialize humans at level 1 and normal bots across levels 1–30, and keep `mass` synchronized through one method:

```ts
setSnakeLevel(snake: Snake, level: number): void {
  snake.level = Math.max(1, Math.floor(level));
  snake.mass = massForLevel(snake.level);
  while (snake.body.length < this.targetSegments(snake.mass)) snake.body.push({ ...snake.body.at(-1)! });
  if (snake.body.length > this.targetSegments(snake.mass)) snake.body.length = this.targetSegments(snake.mass);
}
```

Food pickup calls `setSnakeLevel(s, s.level + (f.kind === 1 ? 3 : 1))`. Tail cuts reduce the victim by one level per severed segment, and snapshot snakes expose `level` and `isBoss`.

- [ ] **Step 4: Add boss and population hooks**

`createBoss(80)` creates exactly one aggressive bot named `BOSS`, marks it `isBoss`, and excludes it from normal replacement. `setBotReplacementEnabled(false)` prevents `ensurePopulation()` from replacing normal bots during `BOSS`.

- [ ] **Step 5: Implement MatchSession transitions**

Store `startedAt`, `phase`, `result`, `bossId`, `playerId`, and `world`. During `tick`, transition at the two exact deadlines. Listen for human death as defeat and boss death as victory. Once in `RESULT`, stop advancing world state. `snapshotFor` merges `world.snapshotFor` with authoritative match state.

- [ ] **Step 6: Build and run focused tests**

Run: `npm run build && node tests/gameplay.mjs`

Expected: level growth, phase transition, boss win/loss, and clean restart tests pass.

### Task 3: Private Server Matches and Reconnection

**Files:**
- Modify: `src/server/index.ts`
- Test: `tests/integration.mjs`

**Interfaces:**
- Consumes: `MatchSession` from Task 2.
- Produces: reconnect sessions containing `{ token, match, snakeId, peerId?, expiresAt? }`.

- [ ] **Step 1: Change integration expectations to private worlds**

Assert client A never sees client B, each snapshot has `match.phase === "GROWTH"`, each player starts at level 1, reconnection restores player and remaining time, and `respawn` sends a fresh `welcome` followed by a new level-1 match with near-full remaining time.

- [ ] **Step 2: Run integration and confirm old shared-room behavior fails**

Run: `npm run build && node tests/integration.mjs`

Expected: private visibility or match payload assertion fails.

- [ ] **Step 3: Replace singleton routing with session routing**

On join, create one `MatchSession` and store it on the reconnect token. Input, snapshots, detach, reattach, replay, and expiry all resolve through that token's match. Tick each unique active or grace-period match once per server tick. `/healthz` reports aggregate `matches`, `humans`, `bots`, `active`, and `foods` across unique matches.

- [ ] **Step 4: Make replay idempotent**

Treat existing `respawn` as replay. `MatchSession.restart` ignores another request for 500 milliseconds after creating a match, which collapses duplicate button/network delivery into one reset. Update stored `snakeId` and send a fresh `welcome` with the same reconnect token so the client renderer follows the new authoritative player ID. The UI only exposes replay in `RESULT`, while the transport accepts an explicit restart during integration verification.

- [ ] **Step 5: Build and run integration**

Run: `npm run build && node tests/integration.mjs`

Expected: two clients have isolated worlds, reconnect resumes, replay resets, and leaving removes both matches after cleanup.

### Task 4: Match HUD and Result Flow

**Files:**
- Modify: `src/client/gameClient.ts`
- Modify: `src/client/app.ts`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `SnapshotMessage.match`, `SnakeSnapshot.level`, and `MatchResult`.
- Produces: `onMatch(match: MatchSnapshot)` callback and solo result UI.

- [ ] **Step 1: Extend client callbacks and state**

Deliver `msg.match` on every snapshot. Store `level`, `matchPhase`, `remainingMs`, `bossLevel`, and `result` in React state. Stop using leaderboard/rank/mass as primary HUD fields.

- [ ] **Step 2: Render focused HUD**

Top center shows a large `M:SS` countdown. Top left shows `LEVEL N`. During `BOSS`, show `BOSS · LV 80` below the timer. Keep kills as a small secondary value. Remove leaderboard markup from the active match.

- [ ] **Step 3: Unify win and defeat results**

When `match.result` becomes non-null, skip instant replay and render one result card with WIN or DEFEAT, final level, kills, and Play Again. Play Again sends `respawn` and waits for the first reset snapshot before returning to active UI.

- [ ] **Step 4: Add responsive CSS**

Add `.match-timer`, `.level-hud`, `.boss-status`, and result modifier classes. At 390 by 844, keep the timer above the play field, the level clear of safe-area insets, and the boost control unobstructed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no TypeScript errors.

### Task 5: Readable Prey, Danger, and Boss Rendering

**Files:**
- Modify: `src/client/rendering/renderTypes.ts`
- Modify: `src/client/rendering/renderer.ts`
- Modify: `src/client/rendering/snakeRenderer.ts`

**Interfaces:**
- Consumes: `SnakeSnapshot.level`, `SnakeSnapshot.isBoss`, and local player level.
- Produces: `drawSnake(..., playerLevel: number)` with badge color derived from relative level.

- [ ] **Step 1: Pass player level into snake drawing**

Find the local interpolated snake once per frame and pass its level to every `drawSnake` call.

- [ ] **Step 2: Replace computed mass labels**

Render `s.level` directly. Use green for lower-level prey, muted white for equal level, red for higher-level danger, gold for the local player, and purple/red with `BOSS` text for the boss. Preserve nickname readability and current zoom compensation.

- [ ] **Step 3: Add boss body treatment**

Use the existing snake geometry and effects; add a thicker pulsing outer glow only when `s.isBoss`. Do not add new art assets.

- [ ] **Step 4: Build and run unit tests**

Run: `npm run build && npm test`

Expected: build and focused suites pass.

### Task 6: Full Verification and Cleanup

**Files:**
- Modify only files changed by Tasks 1–5 when verification exposes a direct defect.

- [ ] **Step 1: Run repository verification**

Run: `npm run verify`

Expected: TypeScript build, focused simulation tests, match tests, and private-world integration all pass.

- [ ] **Step 2: Inspect working-tree scope**

Run: `git status --short` and `git diff --check`.

Expected: only planned source, test, compiled output, CSS, and documentation changes appear, plus the untouched pre-existing `package-lock.json` modification.

- [ ] **Step 3: Run the game and verify both viewports**

Start `npm run dev`, then verify menu, growth HUD, relative-level badges, boss phase, win/defeat card, replay, and 390-by-844 responsive layout. Record any browser console exception as a failure and fix only the responsible planned file.

- [ ] **Step 4: Report the playable outcome**

Summarize the new loop, verification commands/results, any remaining limitations, and the exact files changed. Do not claim visual verification if the browser could not reach the local server.
