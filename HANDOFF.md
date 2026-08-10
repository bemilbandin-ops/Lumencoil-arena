# Lumencoil Arena engineering handoff

This document describes the code that exists in this repository after the current implementation and verification pass.

## 1. Project structure

```text
public/
  index.html                 Static shell
  styles.css                 Responsive menu/HUD/death/replay UI
  vendor/                    Vendored React 16 runtime used by menu/HUD
src/
  client/
    app.ts                    React menu, HUD, settings, death/respawn flow
    audio.ts                  Generated Web Audio pickup/death/spawn/boost effects
    gameClient.ts             Networking, reconnection, snapshot/replay orchestration
    input.ts                  Mouse, keyboard, pointer/touch controls
    renderer.ts               60 FPS Canvas rendering, interpolation, camera, particles, minimap
  server/
    index.ts                  HTTP static server + WebSocket framing/session transport
    game.ts                   Authoritative room simulation, movement, food, collisions, population
    botAI.ts                  Server bot perception/behavior profiles
    spatialHash.ts            Nearby-object acceleration grid
  shared/
    config.ts                 Central gameplay/network/room/skin constants
    types.ts                  Shared protocol/state/math types
  node-shims.d.ts             Minimal Node declarations used by the dependency-light TypeScript build
dist/                         Compiled JS shipped so the game can start without npm install
tests/
  run.mjs                    Focused simulation/AI/spatial/population tests
  integration.mjs            Real server + WebSocket multi-client/reconnect integration test
```

## 2. Running

The checked-in `dist/` is runnable directly:

```text
npm run dev
```

Default URL: `http://localhost:3001`.

To rebuild source first:

```text
npm install
npm run build
npm run dev
```

Full verification:

```text
npm run verify
```

## 3. Client entry points

`src/client/app.ts` is the React shell. React is not used for the realtime simulation/render loop.

`src/client/gameClient.ts` owns connection lifecycle, input message sending, snapshot buffering, 96 ms interpolation delay, buffered instant replay, event de-duplication, and reconnect tokens.

`src/client/renderer.ts` owns Canvas drawing at `requestAnimationFrame` rate. It renders the arena, culls off-screen food/snakes, smooths the camera/zoom, interpolates remote body points, renders skin patterns/eyes/glow, minimap, joystick, spawn/collect/death/boost effects, edge warning, and replay treatment.

`src/client/input.ts` handles mouse steering, click/Space boost, relative touch joystick steering, pointer capture, and cleanup of listeners.

`src/client/audio.ts` generates simple Web Audio effects and supports the persisted SOUND toggle.

## 4. Server entry points

`src/server/index.ts` starts the HTTP/WebSocket server. It serves `public/` and `dist/`, exposes `/healthz`, performs RFC6455 upgrade/framing for browser text messages, supports fragmented text frames and ping/pong/close frames, enforces a payload ceiling, and manages reconnect sessions.

`src/server/game.ts` is the canonical authoritative simulation. Clients send steering/boost/respawn intent only. Position, mass, score, food collection, collisions, kills, death and body growth are calculated server-side.

## 5. Network protocol

Client → server:

- `join { nickname, skin, resumeToken? }`
- `input { seq, angle, boost }`
- `respawn`
- `leave`
- `pong { at }`

Server → client:

- `welcome { playerId, arenaRadius, resumeToken, resumed }`
- `snapshot { serverTime, snakes, foods, leaderboard, you, events }`
- `death { stats }`
- `ping { at }`
- `error { message }`

Input sequence numbers must increase, spammed inputs are rate-limited, impossible/non-finite angles are ignored, and the client cannot submit canonical movement/scoring state.

Simulation is 20 Hz. Snapshots are 12 Hz. Food and snake body state are proximity-limited before transmission instead of sending the entire world to every client.

## 6. Game simulation architecture

One shared always-live arena is implemented. There is no waiting lobby.

The world is circular with radius 4200. Snakes continuously move forward, have capped turn rate, mass-dependent speed/turn penalties, boost speed with mass drain, and chain-following bodies. Body length grows from mass.

Food has ambient, rare/high-value, and dead-snake trail variants. Death converts much of the snake body mass into multiple pickups along the previous body path.

Collision candidates and food/bot nearby queries use spatial hashes. Head → enemy body kills the attacking snake. Near-simultaneous head-to-head contact kills both. Self-body is excluded. The arena boundary is lethal after brief spawn protection.

Humans respawn in-place without a page reload. Spawn points are safety-checked; when another human exists, new humans are preferentially placed within encounter range while retaining minimum separation.

## 7. Bot architecture

Bots are full server-side simulation participants and use no LLM/API calls.

Profiles: `PASSIVE`, `NORMAL`, `AGGRESSIVE`, `GREEDY`, `CAUTIOUS`.

Per-bot randomized parameters include reaction time, aggression, risk tolerance, food attraction, boost tendency, preferred enemy distance, steering noise/accuracy, look-ahead prediction, and wander bias.

Priority order in `botAI.ts`:

1. projected body collision avoidance
2. enemy-head/crossing-trajectory avoidance
3. boundary avoidance
4. valuable/death-trail food pursuit
5. calculated aggression toward smaller snakes
6. wandering/exploration

Bots obey the same movement, boost, food, boundary and collision systems as humans and can eat/die/replenish normally.

## 8. Important configuration

All main tuning lives in `src/shared/config.ts`.

Key values:

- arena radius: 4200
- target active population: 24
- hard population ceiling: 28
- server simulation: 20 Hz
- snapshots: 12 Hz
- starting mass: 42
- base speed: 150
- boost speed: 242
- ambient food target: 1800
- max food: 2600
- reconnect grace: 10 seconds
- spawn protection: 900 ms
- max body points: 190

## 9. Implemented UI/gameplay features

- original Lumencoil title/menu
- generated nickname + persisted nickname
- eight declarative color/pattern skins + persisted selection
- immediate PLAY → live arena flow
- desktop steering/boost
- mobile relative touch joystick + large boost button
- responsive safe-area-aware HUD
- score, rank, mass, kills, survival time
- top-10 leaderboard
- minimap showing boundary/player only
- camera follow + mass-based zoom
- remote snapshot interpolation
- reconnect/resume of the same snake within grace period
- connection lost/reconnecting state
- death screen with score/mass/time/kills
- rapid PLAY AGAIN respawn
- ~2.85 s buffered instant replay
- food collection, death burst, spawn fade/burst, boost trail and valuable-food glow effects
- generated Web Audio effects + mute toggle
- effects toggle
- local best score

## 10. Known remaining bugs / limitations

No known compile, focused simulation, or WebSocket integration failures remain in the checked-in version.

Known limitations rather than hidden TODOs:

- The server intentionally supports one shared room rather than multi-room matchmaking. One room is permitted by the original scope.
- WebSocket transport is implemented in-repo to keep the runtime dependency-free. It supports browser text frames, fragmentation, ping/pong and close, but does not negotiate compression/extensions and rejects binary frames.
- Client rendering interpolates authoritative snapshots but does not implement speculative local-position prediction. Steering therefore inherits normal server/snapshot latency while remaining visually smoothed.
- Replays are client-side buffered snapshots, not server-recorded demos.
- Persistence is localStorage/sessionStorage only. There are no server accounts or permanent global leaderboards.
- Audio is generated synthesis rather than sourced audio assets.

## 11. Verification performed

`npm run verify` passes and currently covers:

- TypeScript build
- spatial hash querying
- shared math
- materially different bot profiles
- bot projected-collision avoidance
- bot food collection
- bot death and automatic replacement
- initial 24-bot population
- human replacing a bot
- input sequence validation
- boost mass drain
- disconnect/reattach of the same snake
- server-authoritative boundary death
- death food creation
- respawn and bot-yield behavior
- intentional leave cleanup/refill
- 28-human hard ceiling and 29th rejection
- two real WebSocket clients in one room
- shared human visibility
- nearby food streaming
- authoritative boost state
- reconnect token restoring the same snake
- room returning to 24 bots after clients leave

The execution environment blocks Chromium from navigating to loopback/private hostnames with an administrator policy. Visual QA was therefore performed with the exact compiled React/Canvas code injected into Chromium plus a visual-only fake transport, while real multiplayer transport was verified separately by the integration test. The browser pass rendered the menu, live arena/HUD/canvas, and a 390×844 mobile viewport with no runtime exceptions; direct loopback navigation itself cannot be tested in this environment.

## 12. Recommended next engineering work

Highest-value future work, if continuing beyond this scope:

1. add optional client-side local movement prediction/reconciliation for high-latency connections
2. binary/packed snapshot encoding if bandwidth profiling shows JSON becoming limiting
3. automatic room sharding/matchmaking if concurrency exceeds one room
4. gameplay tuning from real human sessions, especially bot aggression and food density
5. add browser E2E tests in an environment where localhost navigation is permitted
6. add server metrics/profiling before substantially increasing food/body/population limits
