import { CONFIG } from "../shared/config.js";
import { clamp, type FoodSnapshot, type SnapshotMessage, type SnakeSnapshot, type Vec2, type WorldEvent } from "../shared/types.js";
import type { InputState } from "./input.js";
import { interpolateSnakes, rand, skinFor } from "./rendererUtils.js";
import { drawBackdrop, drawBoundaryWarning, drawFood, drawJoystick, drawMinimap, drawSnake, drawWorldBoundary, type CameraState, type GroundSpeck, type VisualEnv } from "./rendererVisuals.js";

export type RenderPair = { prev: SnapshotMessage; next: SnapshotMessage; t: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string; drag: number };

export class GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private arenaRadius: number = CONFIG.ARENA_RADIUS;
  private playerId = "";
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private dpr = 1;
  private particles: Particle[] = [];
  private spawnFx = new Map<string, number>();
  private flash = 0;
  private shake = 0;
  private specks: GroundSpeck[] = [];
  private effects = true;
  private lastCssWidth = 0;
  private lastCssHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    for (let i = 0; i < 320; i++) this.specks.push({ x: Math.random(), y: Math.random(), size: Math.random() * 1.4 + .35, alpha: Math.random() * .11 + .025 });
    this.resize();
  }

  setArenaRadius(radius: number): void { this.arenaRadius = radius; }
  setPlayerId(id: string): void { this.playerId = id; }
  setEffects(enabled: boolean): void { this.effects = enabled; if (!enabled) this.particles = []; }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(r.width)), cssHeight = Math.max(1, Math.round(r.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    const physicalWidth = Math.max(1, Math.round(cssWidth * nextDpr)), physicalHeight = Math.max(1, Math.round(cssHeight * nextDpr));
    this.lastCssWidth = cssWidth; this.lastCssHeight = cssHeight;
    // Changing canvas.width/height clears the backing store; don't do it for no-op ResizeObserver callbacks.
    if (this.canvas.width === physicalWidth && this.canvas.height === physicalHeight && this.dpr === nextDpr) return;
    this.dpr = nextDpr; this.canvas.width = physicalWidth; this.canvas.height = physicalHeight;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ctx.imageSmoothingEnabled = true;
  }

  handleEvent(event: WorldEvent): void {
    if (event.type === "spawn") {
      this.spawnFx.set(event.snakeId, performance.now());
      if (!this.effects) return;
      const skin = skinFor(event.skin);
      for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, speed = rand(18, 75); this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.28, .65), rand(2, 5), i % 2 ? skin.body : skin.accent, 1.7); }
      return;
    }
    if (event.type === "collect") {
      if (!this.effects) return;
      const colors = event.kind === 2 ? ["#ffd86e", "#fff1ab"] : event.kind === 1 ? ["#f98cff", "#9de8ff"] : ["#d8d2ff", "#ffffff", "#9f8dff"];
      const count = Math.min(16, 5 + event.value * 2);
      for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, speed = rand(25, 110); this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.18, .45), rand(1.5, 4.4), colors[i % colors.length]!, 2.5); }
      // No full-screen pickup flash: dense food trails were the main source of visible blinking.
      return;
    }
    if (event.type === "death") {
      const skin = skinFor(event.skin);
      if (this.effects) for (let i = 0, count = Math.min(68, 26 + Math.floor(event.mass * .22)); i < count; i++) { const a = Math.random() * Math.PI * 2, speed = rand(35, 210); this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.35, .95), rand(2.5, 8.5), i % 3 === 0 ? skin.accent : skin.body, 1.4); }
      if (Math.hypot(event.x - this.camera.x, event.y - this.camera.y) < 900) this.shake = Math.max(this.shake, event.snakeId === this.playerId ? 12 : 5);
      if (event.snakeId === this.playerId) this.flash = .45;
    }
  }

  render(pair: RenderPair | null, now: number, dt: number, input: InputState, replaying: boolean): void {
    const width = this.canvas.clientWidth || this.lastCssWidth || 1, height = this.canvas.clientHeight || this.lastCssHeight || 1;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Keep every frame opaque; never expose a transparent frame between clear and paint.
    ctx.fillStyle = "#20242a"; ctx.fillRect(0, 0, width, height);

    let me: SnakeSnapshot | undefined, snakes: SnakeSnapshot[] = [];
    if (pair) { snakes = interpolateSnakes(pair.prev.snakes, pair.next.snakes, pair.t); me = snakes.find(s => s.id === this.playerId); if (me?.body[0]) this.updateCamera(me, dt, replaying); }

    const env: VisualEnv = { canvas: this.canvas, ctx, camera: this.camera, arenaRadius: this.arenaRadius, effects: this.effects };
    drawBackdrop(env, width, height, now, this.specks);
    if (pair) {
      const sx = this.effects && this.shake > .1 ? rand(-this.shake, this.shake) : 0, sy = this.effects && this.shake > .1 ? rand(-this.shake, this.shake) : 0;
      ctx.save(); ctx.translate(width / 2 + sx, height / 2 + sy); ctx.scale(this.camera.zoom, this.camera.zoom); ctx.translate(-this.camera.x, -this.camera.y);
      drawWorldBoundary(ctx, this.arenaRadius); drawFood(env, pair.next.foods, now);
      for (const snake of snakes) {
        const spawnAt = this.spawnFx.get(snake.id), spawnT = spawnAt ? clamp((now - spawnAt) / 520, 0, 1) : 1;
        if (spawnAt && spawnT >= 1) this.spawnFx.delete(snake.id);
        drawSnake(env, snake, snake.id === this.playerId, now, spawnT, this.pushParticle);
      }
      this.updateParticles(dt); this.drawParticles(ctx); ctx.restore();
      drawBoundaryWarning(ctx, width, height, this.arenaRadius, me?.body[0]); drawMinimap(ctx, width, height, this.arenaRadius, me?.body[0]);
    } else this.updateParticles(dt);

    if (input.joystickAnchor) drawJoystick(ctx, input.joystickAnchor, input.joystickKnob ?? input.joystickAnchor);
    if (replaying) this.drawReplayTreatment(ctx, width, height, now);
    if (this.flash > .001) { ctx.fillStyle = `rgba(255,242,229,${Math.min(.38, this.flash)})`; ctx.fillRect(0, 0, width, height); this.flash *= Math.exp(-dt * 8.5); }
    this.shake *= Math.exp(-dt * 7.5);
  }

  private updateCamera(me: SnakeSnapshot, dt: number, replaying: boolean): void {
    const head = me.body[0]!, desiredZoom = clamp(1.23 - (me.mass - CONFIG.START_MASS) * .00235, .62, 1.23);
    const smooth = 1 - Math.exp(-dt * (replaying ? 3.2 : 7.2));
    if (Math.abs(this.camera.x) < .001 && Math.abs(this.camera.y) < .001) { this.camera.x = head.x; this.camera.y = head.y; }
    else { this.camera.x += (head.x - this.camera.x) * smooth; this.camera.y += (head.y - this.camera.y) * smooth; }
    this.camera.zoom += (desiredZoom - this.camera.zoom) * smooth;
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) { const t = clamp(p.life / p.maxLife, 0, 1); ctx.globalAlpha = t * t; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.5, p.size * (.35 + t * .65)), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  private updateParticles(dt: number): void {
    if (!this.effects) return;
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; const damp = Math.exp(-p.drag * dt); p.vx *= damp; p.vy *= damp; }
    this.particles = this.particles.filter(p => p.life > 0); if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
  }
  private pushParticle = (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag: number): void => {
    if (this.effects) this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, drag });
  };
  private drawReplayTreatment(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const scan = (now * .08) % 8; ctx.save(); ctx.globalAlpha = .045; ctx.fillStyle = "#fff"; for (let y = scan; y < height; y += 8) ctx.fillRect(0, y, width, 1); ctx.restore();
  }
}
