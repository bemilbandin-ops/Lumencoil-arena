import { CONFIG } from "../shared/config.js";
import { clamp } from "../shared/types.js";
import { GameAudio } from "./audio.js";
import { InputController } from "./input.js";
import { previewLocalSnake } from "./inputPreview.js";
import { GameRenderer } from "./renderer.js";
export class GameClient {
    ws = null;
    canvas;
    callbacks;
    nickname;
    skin;
    renderer;
    input;
    audio;
    playerId = "";
    resumeToken = sessionStorage.getItem("lumencoil.resume") || "";
    snapshots = [];
    replayBuffer = [];
    replayFrames = [];
    replayStartedAt = 0;
    replayDuration = 2850;
    replayActive = false;
    seq = 0;
    lastInputSend = 0;
    raf = 0;
    lastFrame = performance.now();
    resizeObserver;
    disposed = false;
    gracefulClose = false;
    reconnectAttempts = 0;
    reconnectTimer = 0;
    replayTimer = 0;
    lastEventId = 0;
    settings;
    constructor(canvas, nickname, skin, settings, callbacks) {
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
    setBoost(active) {
        this.audio.unlock();
        this.input.setExternalBoost(active);
        this.audio.setBoost(active);
    }
    setSettings(settings) {
        this.settings = settings;
        this.audio.setEnabled(settings.sound);
        this.renderer.setEffects(settings.effects);
    }
    respawn() {
        this.stopReplay();
        this.replayBuffer = [];
        this.ws?.send(JSON.stringify({ type: "respawn" }));
    }
    disconnect(graceful = true) {
        this.disposed = true;
        this.gracefulClose = graceful;
        if (this.reconnectTimer)
            window.clearTimeout(this.reconnectTimer);
        if (this.replayTimer)
            window.clearTimeout(this.replayTimer);
        this.resizeObserver.disconnect();
        this.input.dispose();
        cancelAnimationFrame(this.raf);
        if (graceful) {
            if (this.ws?.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: "leave" }));
                }
                catch { }
            }
            sessionStorage.removeItem("lumencoil.resume");
            this.resumeToken = "";
        }
        this.audio.setBoost(false);
        this.ws?.close();
        this.ws = null;
    }
    connect(reconnecting) {
        if (this.disposed)
            return;
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
        ws.onerror = () => { };
        ws.onclose = () => {
            if (this.disposed || this.gracefulClose)
                return;
            this.callbacks.onPhase("reconnecting");
            this.audio.setBoost(false);
            this.reconnectAttempts++;
            if (this.reconnectAttempts > 10) {
                this.callbacks.onPhase("failed");
                return;
            }
            this.reconnectTimer = window.setTimeout(() => this.connect(true), Math.min(5000, 500 + this.reconnectAttempts * 420));
        };
    }
    onMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data);
        }
        catch {
            return;
        }
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
            if (!msg.resumed)
                this.audio.spawn();
            if (this.input.state.hasDirection)
                this.sendInput(this.input.state.angle, this.input.state.boost, true);
            return;
        }
        if (msg.type === "snapshot") {
            const timed = { at: performance.now(), message: msg };
            this.snapshots.push(timed);
            if (this.snapshots.length > 4)
                this.snapshots.shift();
            this.replayBuffer.push(timed);
            const cutoff = performance.now() - 5200;
            while (this.replayBuffer.length && this.replayBuffer[0].at < cutoff)
                this.replayBuffer.shift();
            this.processEvents(msg.events);
            this.callbacks.onStats({ ...msg.you, leaderboard: msg.leaderboard });
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
    processEvents(events) {
        for (const event of events) {
            if (event.id <= this.lastEventId)
                continue;
            this.lastEventId = Math.max(this.lastEventId, event.id);
            this.renderer.handleEvent(event);
            if (event.type === "collect" && event.eaterId === this.playerId)
                this.audio.pickup(event.value);
            if (event.type === "spawn" && event.snakeId === this.playerId)
                this.audio.spawn();
        }
    }
    startReplay() {
        this.replayFrames = this.replayBuffer.slice();
        if (this.replayFrames.length < 8) {
            this.replayActive = false;
            this.callbacks.onReplay(false);
            return;
        }
        this.replayActive = true;
        this.replayStartedAt = performance.now();
        this.callbacks.onReplay(true);
        if (this.replayTimer)
            window.clearTimeout(this.replayTimer);
        this.replayTimer = window.setTimeout(() => this.stopReplay(), this.replayDuration + 80);
    }
    stopReplay() {
        if (!this.replayActive)
            return;
        this.replayActive = false;
        this.replayFrames = [];
        this.callbacks.onReplay(false);
    }
    sendInput(angle, boost, force) {
        const now = performance.now();
        if (!force && now - this.lastInputSend < CONFIG.CLIENT_INPUT_SEND_INTERVAL_MS)
            return;
        if (this.ws?.readyState !== WebSocket.OPEN || !this.playerId)
            return;
        this.lastInputSend = now;
        this.seq++;
        this.ws.send(JSON.stringify({ type: "input", seq: this.seq, angle, boost }));
        this.audio.setBoost(boost);
    }
    frame = (now) => {
        const dt = Math.min(.05, (now - this.lastFrame) / 1000);
        this.lastFrame = now;
        let pair = this.getRenderPair(now);
        if (pair && !this.replayActive && this.input.state.hasDirection)
            pair = this.previewRenderPair(pair);
        this.renderer.render(pair, now, dt, this.input.state, this.replayActive);
        this.raf = requestAnimationFrame(this.frame);
    };
    previewRenderPair(pair) {
        const preview = (message) => {
            const index = message.snakes.findIndex(s => s.id === this.playerId);
            if (index < 0)
                return message;
            const snakes = message.snakes.slice();
            snakes[index] = previewLocalSnake(snakes[index], this.input.state.angle, this.input.state.boost);
            return { ...message, snakes };
        };
        return { prev: preview(pair.prev), next: preview(pair.next), t: pair.t };
    }
    getRenderPair(now) {
        if (this.replayActive && this.replayFrames.length > 1) {
            const frames = this.replayFrames;
            const start = Math.max(0, frames.length - Math.min(frames.length, 45));
            const available = frames.length - start;
            const progress = clamp((now - this.replayStartedAt) / this.replayDuration, 0, 1);
            const eased = 1 - Math.pow(1 - progress, 1.2);
            const f = start + eased * Math.max(1, available - 1);
            const i = Math.min(frames.length - 1, Math.floor(f));
            const j = Math.min(frames.length - 1, i + 1);
            return { prev: frames[i].message, next: frames[j].message, t: f - i };
        }
        if (!this.snapshots.length)
            return null;
        if (this.snapshots.length === 1)
            return { prev: this.snapshots[0].message, next: this.snapshots[0].message, t: 1 };
        const a = this.snapshots[this.snapshots.length - 2];
        const b = this.snapshots[this.snapshots.length - 1];
        const target = now - CONFIG.LIVE_INTERPOLATION_DELAY_MS;
        const t = clamp((target - a.at) / Math.max(1, b.at - a.at), 0, 1);
        return { prev: a.message, next: b.message, t };
    }
}
