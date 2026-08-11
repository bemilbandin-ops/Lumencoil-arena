import { clamp, type SnakeSnapshot, type WorldEvent } from "../../shared/types.js";
import { rand, skinFor } from "./renderMath.js";
import type { CameraState, Particle } from "./renderTypes.js";

export class EffectsRenderer {
  private particles: Particle[] = [];
  private spawnFx = new Map<string, number>();
  private flash = 0;
  private shake = 0;
  private effects = true;

  get enabled(): boolean { return this.effects; }

  setEnabled(enabled: boolean): void {
    this.effects = enabled;
    if (!enabled) this.particles = [];
  }

  handleEvent(event: WorldEvent, playerId: string, camera: CameraState): void {
    if (event.type === "spawn") {
      this.spawnFx.set(event.snakeId, performance.now());
      if (!this.effects) return;
      const skin = skinFor(event.skin);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, speed = rand(18, 75);
        this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.28, .65), rand(2, 5), i % 2 ? skin.body : skin.accent, 1.7);
      }
      return;
    }
    if (event.type === "collect") {
      if (!this.effects) return;
      const colors = event.kind === 2 ? ["#ffd86e", "#fff1ab"] : event.kind === 1 ? ["#f98cff", "#9de8ff"] : ["#d8d2ff", "#ffffff", "#9f8dff"];
      const count = Math.min(16, 5 + event.value * 2);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, speed = rand(25, 110);
        this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.18, .45), rand(1.5, 4.4), colors[i % colors.length]!, 2.5);
      }
      return;
    }
    if (event.type === "death") {
      const skin = skinFor(event.skin);
      if (this.effects) for (let i = 0, count = Math.min(68, 26 + Math.floor(event.mass * .22)); i < count; i++) {
        const a = Math.random() * Math.PI * 2, speed = rand(35, 210);
        this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.35, .95), rand(2.5, 8.5), i % 3 === 0 ? skin.accent : skin.body, 1.4);
      }
      if (Math.hypot(event.x - camera.x, event.y - camera.y) < 900) this.shake = Math.max(this.shake, event.snakeId === playerId ? 12 : 5);
      if (event.snakeId === playerId) this.flash = .45;
    }
  }

  spawnTForSnake(snakeId: string, now: number): number {
    const spawnAt = this.spawnFx.get(snakeId);
    const spawnT = spawnAt ? clamp((now - spawnAt) / 520, 0, 1) : 1;
    if (spawnAt && spawnT >= 1) this.spawnFx.delete(snakeId);
    return spawnT;
  }

  getShakeOffset(): { x: number; y: number } {
    if (!this.effects || this.shake <= .1) return { x: 0, y: 0 };
    return { x: rand(-this.shake, this.shake), y: rand(-this.shake, this.shake) };
  }

  emitBoostTrail(s: SnakeSnapshot): void {
    if (!this.effects || !s.boost || s.body.length < 2) return;
    const head = s.body[0]!;
    const tail = s.body[Math.min(s.body.length - 1, 8)]!;
    if (Math.random() < .72) {
      const palette = skinFor(s.skin);
      const rear = Math.atan2(head.y - s.body[1]!.y, head.x - s.body[1]!.x) + Math.PI;
      this.pushParticle(tail.x, tail.y, Math.cos(rear) * rand(35, 95) + rand(-24, 24), Math.sin(rear) * rand(35, 95) + rand(-24, 24), rand(.22, .48), rand(3, 7), Math.random() < .5 ? palette.glow : palette.accent, 2.2);
    }
  }

  updateAndDraw(ctx: CanvasRenderingContext2D, dt: number): void {
    this.updateParticles(dt);
    this.drawParticles(ctx);
  }

  update(dt: number): void { this.updateParticles(dt); }

  drawFrameOverlays(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, dt: number, replaying: boolean): void {
    if (replaying) this.drawReplayTreatment(ctx, width, height, now);
    if (this.flash > .001) {
      ctx.fillStyle = `rgba(255,242,229,${Math.min(.38, this.flash)})`;
      ctx.fillRect(0, 0, width, height);
      this.flash *= Math.exp(-dt * 8.5);
    }
    this.shake *= Math.exp(-dt * 7.5);
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = t * t;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.5, p.size * (.35 + t * .65)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private updateParticles(dt: number): void {
    if (!this.effects) return;
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const damp = Math.exp(-p.drag * dt); p.vx *= damp; p.vy *= damp;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
  }

  private pushParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag: number): void {
    if (this.effects) this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, drag });
  }

  private drawReplayTreatment(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const scan = (now * .08) % 8;
    ctx.save(); ctx.globalAlpha = .045; ctx.fillStyle = "#fff";
    for (let y = scan; y < height; y += 8) ctx.fillRect(0, y, width, 1);
    ctx.restore();
  }
}
