import { CONFIG } from "../shared/config.js";
import type { MatchSnapshot } from "../shared/match.js";
import { clamp, type DeathStats, type SelfStats, type ServerMessage, type SnapshotMessage, type WorldEvent } from "../shared/types.js";
import { GameAudio } from "./audio.js";
import { InputController } from "./input.js";
import { GameRenderer, type RenderPair } from "./renderer.js";

type UiStats = SelfStats & { match: MatchSnapshot };
type GameCallbacks = {
  onPhase: (phase: "connecting" | "playing" | "reconnecting" | "failed") => void;
  onStats: (stats: UiStats) => void;
  onDeath: (stats: DeathStats) => void;
  onReplay: (active: boolean) => void;
};

type TimedSnapshot = { at: number; message: SnapshotMessage };
type GameSettings = { sound: boolean; effects: boolean };

export class GameClient {
  private ws: WebSocket | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: GameCallbacks;
  private readonly nickname: string;
  private readonly skin: string;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly audio: GameAudio;
  private playerId = "";
  private resumeToken = sessionStorage.getItem("lumencoil.resume") || "";
  private snapshots: TimedSnapshot[] = [];
  private replayBuffer: TimedSnapshot[] = [];
  private replayFrames: TimedSnapshot[] = [];
  private replayStartedAt = 0;
  private replayDuration = 2850;
  private replayActive = false;
  private seq = 0;
  private lastInputSend = 0;
  private raf = 0;
  private lastFrame = performance.now();
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private gracefulClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer = 0;
  private replayTimer = 0;
  private lastEventId = 0;
  private settings: GameSettings;

  constructor(canvas: HTMLCanvasElement, nickname: string, skin: string, settings: GameSettings, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.nickname = nickname;
    this.skin = skin;
    this.settings = settings;
    this.callbacks = callbacks;
    this.renderer = new GameRenderer(canvas);
    this.renderer.setEffects(settings.effects);
    this.audio = new GameAudio(settings.sound);
    this.audio.unlock();
    this.input = new InputController(canvas, (angle, boost, force) => this.sendInput(angle, boost, force));
    this.resizeObserver = new ResizeObserver(() => this.renderer.resize());
    this.resizeObserver.observe(canvas);
    this.connect(false);
    this.raf = requestAnimationFrame(this.frame);
  }

  setBoost(active: boolean): void {
    this.audio.unlock();
    this.input.setExternalBoost(active);
    this.audio.setBoost(active);
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
    this.audio.setEnabled(settings.sound);
    this.renderer.setEffects(settings.effects);
  }

  respawn(): void {
    this.stopReplay();
    this.replayBuffer = [];
    this.ws?.send(JSON.stringify({ type: "respawn" }));
  }

  disconnect(graceful = true): void {
    this.disposed = true;
    this.gracefulClose = graceful;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.replayTimer) window.clearTimeout(this.replayTimer);
    this.resizeObserver.disconnect();
    this.input.dispose();
    cancelAnimationFrame(this.raf);
    if (graceful) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ type: "leave" })); } catch {}
      }
      sessionStorage.removeItem("lumencoil.resume");
      this.resumeToken = "";
    }
    this.audio.setBoost(false);
    this.ws?.close();
    this.ws = null;
  }

  private connect(reconnecting: boolean): void {
    if (this.disposed) return;
    this.callbacks.onPhase(reconnecting ? "reconnecting" : "connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.gracefulClose = false;
      ws.send(JSON.stringify({ type: "join", nickname: this.nickname, skin: this.skin, resumeToken: this.resumeToken || undefined }));
    };
    ws.onmessage = ev => this.onMessage(String(ev.data));
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.disposed || this.gracefulClose) return;
      this.callbacks.onPhase("reconnecting");
      this.audio.setBoost(false);
      this.reconnectAttempts++;
      if (this.reconnectAttempts > 10) { this.callbacks.onPhase("failed"); return; }
      this.reconnectTimer = window.setTimeout(() => this.connect(true), Math.min(5000, 500 + this.reconnectAttempts * 420));
    };
  }

  private onMessage(data: string): void {
    let msg: ServerMessage;
    try { msg = JSON.parse(data) as ServerMessage; } catch { return; }
    if (msg.type === "welcome") {
      this.playerId = msg.playerId;
      this.resumeToken = msg.resumeToken;
      sessionStorage.setItem("lumencoil.resume", msg.resumeToken);
      this.renderer.setPlayerId(msg.playerId);
      this.renderer.setArenaRadius(msg.arenaRadius);
      this.snapshots = [];
      this.lastEventId = 0;
      this.callbacks.onPhase("playing");
      this.audio.unlock();
      if (!msg.resumed) this.audio.spawn();
      this.sendInput(this.input.state.angle, this.input.state.boost, true);
      return;
    }

    if (msg.type === "snapshot") {
      const timed = { at: performance.now(), message: msg };
      this.snapshots.push(timed);
      if (this.snapshots.length > 4) this.snapshots.shift();
      this.replayBuffer.push(timed);
      const cutoff = performance.now() - 5200;
      while (this.replayBuffer.length && this.replayBuffer[0]!.at < cutoff) this.replayBuffer.shift();
      this.processEvents(msg.events);
      if (msg.match) this.callbacks.onStats({ ...msg.you, match: msg.match });
      return;
    }

    if (msg.type === "death") {
      this.audio.setBoost(false);
      this.audio.death();
      this.startReplay();
      this.callbacks.onDeath(msg.stats);
      return;
    }

    if (msg.type === "ping") {
      this.ws?.send(JSON.stringify({ type: "pong", at: msg.at }));
      return;
    }

    if (msg.type === "error") {
      this.callbacks.onPhase("failed");
    }
  }

  private processEvents(events: WorldEvent[]): void {
    for (const event of events) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = Math.max(this.lastEventId, event.id);
      this.renderer.handleEvent(event);
      if (event.type === "collect" && event.eaterId === this.playerId) this.audio.pickup(event.value);
      if (event.type === "spawn" && event.snakeId === this.playerId) this.audio.spawn();
    }
  }

  private startReplay(): void {
    this.replayFrames = this.replayBuffer.slice();
    if (this.replayFrames.length < 8) {
      this.replayActive = false;
      this.callbacks.onReplay(false);
      return;
    }
    this.replayActive = true;
    this.replayStartedAt = performance.now();
    this.callbacks.onReplay(true);
    if (this.replayTimer) window.clearTimeout(this.replayTimer);
    this.replayTimer = window.setTimeout(() => this.stopReplay(), this.replayDuration + 80);
  }

  private stopReplay(): void {
    if (!this.replayActive) return;
    this.replayActive = false;
    this.replayFrames = [];
    this.callbacks.onReplay(false);
  }

  private sendInput(angle: number, boost: boolean, force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastInputSend < CONFIG.CLIENT_INPUT_SEND_INTERVAL_MS) return;
    if (this.ws?.readyState !== WebSocket.OPEN || !this.playerId) return;
    this.lastInputSend = now;
    this.seq++;
    this.ws.send(JSON.stringify({ type: "input", seq: this.seq, angle, boost }));
    this.audio.setBoost(boost);
  }

  private frame = (now: number): void => {
    const dt = Math.min(.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const pair = this.getRenderPair(now);
    this.renderer.render(pair, now, dt, this.input.state, this.replayActive);
    this.raf = requestAnimationFrame(this.frame);
  };

  private getRenderPair(now: number): RenderPair | null {
    if (this.replayActive && this.replayFrames.length > 1) {
      const frames = this.replayFrames;
      const start = Math.max(0, frames.length - Math.min(frames.length, 45));
      const available = frames.length - start;
      const progress = clamp((now - this.replayStartedAt) / this.replayDuration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 1.2);
      const f = start + eased * Math.max(1, available - 1);
      const i = Math.min(frames.length - 1, Math.floor(f));
      const j = Math.min(frames.length - 1, i + 1);
      return { prev: frames[i]!.message, next: frames[j]!.message, t: f - i };
    }
    if (!this.snapshots.length) return null;
    if (this.snapshots.length === 1) return { prev: this.snapshots[0]!.message, next: this.snapshots[0]!.message, t: 1 };
    const a = this.snapshots[this.snapshots.length - 2]!;
    const b = this.snapshots[this.snapshots.length - 1]!;
    const target = now - CONFIG.LIVE_INTERPOLATION_DELAY_MS;
    const t = clamp((target - a.at) / Math.max(1, b.at - a.at), 0, 1);
    return { prev: a.message, next: b.message, t };
  }
}
