# Lumencoil Arena

Original browser multiplayer snake survival game with a server-authoritative Node simulation, live WebSocket state, server bots, desktop mouse controls, mobile touch steering, respawning, leaderboard, minimap, replay, effects, skins, and generated Web Audio effects.

## Quick start

The repository includes compiled `dist/` output, so running the included build does **not** require installing packages first.

```powershell
npm run dev
```

Open:

```text
http://localhost:3001
```

Use another port if needed:

```powershell
$env:PORT=3010
npm run dev
```

## Editing TypeScript source

Install the declared TypeScript development dependency once, then rebuild:

```powershell
npm install
npm run build
npm run dev
```

Useful commands:

```text
npm run typecheck
npm test
npm run test:integration
npm run verify
```

`npm run verify` rebuilds the TypeScript, runs focused simulation tests, then starts a temporary server and exercises real WebSocket multiplayer/reconnection.

## Controls

Desktop: move the mouse to steer. Hold left mouse or Space to boost.

Phone/tablet: drag on the arena to steer and hold the BOOST button to accelerate.
