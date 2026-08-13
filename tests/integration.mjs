import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3317;
const child = spawn(process.execPath, ["dist/server/index.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", d => logs += d);
child.stderr.on("data", d => logs += d);

try {
  await waitForHealth();
  const a = await connectClient("Alpha", "nova");
  const b = await connectClient("Beta", "ember");
  const snapA = await a.next("snapshot", 2500);
  const snapB = await b.next("snapshot", 2500);
  assert.ok(snapA.snakes.some(s => s.id === a.playerId), "client A sees itself");
  assert.equal(snapA.snakes.some(s => s.id === b.playerId), false, "client A cannot see client B's private match");
  assert.equal(snapB.snakes.some(s => s.id === a.playerId), false, "client B cannot see client A's private match");
  assert.equal(snapA.match.phase, "GROWTH", "solo match starts in growth phase");
  assert.ok(snapA.you.level >= 1 && snapA.you.level <= 6, "client A begins at a fresh low level");
  assert.ok(snapB.you.level >= 1 && snapB.you.level <= 6, "client B begins at a fresh low level");
  assert.ok(snapA.foods.length > 0, "nearby food is streamed");

  a.ws.send(JSON.stringify({ type: "input", seq: 1, angle: 1.2, boost: true }));
  let movedSelf;
  for (let attempt = 0; attempt < 8 && !movedSelf?.boost; attempt++) {
    const moved = await a.next("snapshot", 2500);
    movedSelf = moved.snakes.find(s => s.id === a.playerId);
  }
  assert.equal(movedSelf?.boost, true, "authoritative server applies boost input");

  const token = a.resumeToken;
  a.ws.close();
  await sleep(250);
  const resumed = await connectClient("Alpha", "nova", token);
  assert.equal(resumed.playerId, a.playerId, "reconnect token resumes the same snake");
  assert.equal(resumed.resumed, true, "server marks resumed session");
  const resumedSnapshot = await resumed.next("snapshot", 2500);
  assert.ok(resumedSnapshot.match.remainingMs < snapA.match.remainingMs, "reconnect resumes the authoritative timer");

  await sleep(600);
  resumed.ws.send(JSON.stringify({ type: "respawn" }));
  const restartedWelcome = await resumed.next("welcome", 2500);
  const restartedSnapshot = await resumed.next("snapshot", 2500);
  assert.equal(restartedWelcome.resumeToken, token, "replay keeps the reconnect token");
  assert.ok(restartedSnapshot.you.level >= 1 && restartedSnapshot.you.level <= 6, "replay resets the player to a fresh low level");
  assert.ok(restartedSnapshot.match.remainingMs > 89_000, "replay resets the match timer");

  resumed.ws.send(JSON.stringify({ type: "leave" }));
  b.ws.send(JSON.stringify({ type: "leave" }));
  await sleep(300);
  const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
  assert.equal(health.matches, 0, "intentional leaves remove both private matches");
  assert.equal(health.active, 0, "no snakes remain after private matches are removed");

  console.log("Private solo-match integration passed", { playerA: a.playerId, playerB: b.playerId, resumed: resumed.resumed });
} finally {
  child.kill("SIGTERM");
}

async function connectClient(nickname, skin, resumeToken = "") {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong", at: msg.at })); return; }
    const waiterIndex = waiters.findIndex(w => w.type === msg.type);
    if (waiterIndex >= 0) waiters.splice(waiterIndex, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.send(JSON.stringify({ type: "join", nickname, skin, resumeToken: resumeToken || undefined }));
  const welcome = await nextType("welcome", 2500);
  return { ws, playerId: welcome.playerId, resumeToken: welcome.resumeToken, resumed: welcome.resumed, next: nextType };

  function nextType(type, timeoutMs) {
    const existing = queue.findIndex(m => m.type === type);
    if (existing >= 0) return Promise.resolve(queue.splice(existing, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const i = waiters.indexOf(waiter);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
    });
  }
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Server never became healthy. Logs: ${logs}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
