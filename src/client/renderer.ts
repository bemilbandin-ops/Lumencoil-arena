import { CONFIG, SKINS, type SkinDefinition } from "../shared/config.js";
import { clamp, type FoodSnapshot, type SnapshotMessage, type SnakeSnapshot, type Vec2, type WorldEvent } from "../shared/types.js";
import type { InputState } from "./input.js";

export type RenderPair = { prev: SnapshotMessage; next: SnapshotMessage; t: number };

type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; drag: number;
};

export class GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private arenaRadius: number = CONFIG.ARENA_RADIUS;
  private playerId = "";
  private camera = { x: 0, y: 0, zoom: 1 };
  private dpr = 1;
  private particles: Particle[] = [];
  private spawnFx = new Map<string, number>();
  private flash = 0;
  private shake = 0;
  private starSeed: Array<Vec2 & { size: number; alpha: number }> = [];
  private nebulaSeed: Array<Vec2 & { radius: number; hue: number }> = [];
  private effects = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    for (let i = 0; i < 220; i++) this.starSeed.push({ x: Math.random(), y: Math.random(), size: Math.random() * 1.5 + 0.4, alpha: Math.random() * 0.22 + 0.05 });
    for (let i = 0; i < 8; i++) this.nebulaSeed.push({ x: Math.random(), y: Math.random(), radius: 180 + Math.random() * 340, hue: [196, 225, 268, 302][i % 4]! });
    this.resize();
  }

  setArenaRadius(radius: number): void { this.arenaRadius = radius; }
  setPlayerId(id: string): void { this.playerId = id; }
  setEffects(enabled: boolean): void { this.effects = enabled; if (!enabled) this.particles = []; }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  handleEvent(event: WorldEvent): void {
    if (event.type === "spawn") {
      this.spawnFx.set(event.snakeId, performance.now());
      if (!this.effects) return;
      const skin = skinFor(event.skin);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = rand(18, 75);
        this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.28, .65), rand(2, 5), i % 2 ? skin.body : skin.accent, 1.7);
      }
      return;
    }
    if (event.type === "collect") {
      if (!this.effects) return;
      const colors = event.kind === 2 ? ["#ffd86e", "#fff1ab"] : event.kind === 1 ? ["#f98cff", "#9de8ff"] : ["#8ef8ff", "#c5ff8a", "#ff9acb"];
      const count = Math.min(16, 5 + event.value * 2);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = rand(25, 110);
        this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.18, .45), rand(1.5, 4.4), colors[i % colors.length]!, 2.5);
      }
      if (event.eaterId === this.playerId) this.flash = Math.max(this.flash, .09 + Math.min(.12, event.value * .015));
      return;
    }
    if (event.type === "death") {
      const skin = skinFor(event.skin);
      if (this.effects) {
        const count = Math.min(68, 26 + Math.floor(event.mass * .22));
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const speed = rand(35, 210);
          this.pushParticle(event.x, event.y, Math.cos(a) * speed, Math.sin(a) * speed, rand(.35, .95), rand(2.5, 8.5), i % 3 === 0 ? skin.accent : skin.body, 1.4);
        }
      }
      const distance = Math.hypot(event.x - this.camera.x, event.y - this.camera.y);
      if (distance < 900) this.shake = Math.max(this.shake, event.snakeId === this.playerId ? 12 : 5);
      if (event.snakeId === this.playerId) this.flash = .45;
    }
  }

  render(pair: RenderPair | null, now: number, dt: number, input: InputState, replaying: boolean): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#050711";
    ctx.fillRect(0, 0, width, height);

    let me: SnakeSnapshot | undefined;
    let snakes: SnakeSnapshot[] = [];
    if (pair) {
      snakes = interpolateSnakes(pair.prev.snakes, pair.next.snakes, pair.t);
      me = snakes.find(s => s.id === this.playerId);
      if (me?.body[0]) this.updateCamera(me, dt, replaying);
    }

    this.drawBackdrop(width, height, now);
    if (pair) {
      const sx = this.effects && this.shake > .1 ? rand(-this.shake, this.shake) : 0;
      const sy = this.effects && this.shake > .1 ? rand(-this.shake, this.shake) : 0;
      ctx.save();
      ctx.translate(width / 2 + sx, height / 2 + sy);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(-this.camera.x, -this.camera.y);
      this.drawWorldBoundary(ctx);
      this.drawFood(ctx, pair.next.foods, now);
      for (const snake of snakes) this.drawSnake(ctx, snake, snake.id === this.playerId, now);
      this.updateParticles(dt);
      this.drawParticles(ctx);
      ctx.restore();
      this.drawBoundaryWarning(width, height, me?.body[0]);
      this.drawMinimap(ctx, width, height, me?.body[0]);
    } else {
      this.updateParticles(dt);
    }

    if (input.joystickAnchor) this.drawJoystick(ctx, input.joystickAnchor, input.joystickKnob ?? input.joystickAnchor);
    if (replaying) this.drawReplayTreatment(ctx, width, height, now);
    if (this.flash > .001) {
      ctx.fillStyle = `rgba(210,245,255,${Math.min(.42, this.flash)})`;
      ctx.fillRect(0, 0, width, height);
      this.flash *= Math.exp(-dt * 8.5);
    }
    this.shake *= Math.exp(-dt * 7.5);
  }

  private updateCamera(me: SnakeSnapshot, dt: number, replaying: boolean): void {
    const head = me.body[0]!;
    const desiredZoom = clamp(1.14 - (me.mass - CONFIG.START_MASS) * 0.0027, 0.56, 1.14);
    const smooth = 1 - Math.exp(-dt * (replaying ? 3.2 : 6.2));
    if (Math.abs(this.camera.x) < .001 && Math.abs(this.camera.y) < .001) {
      this.camera.x = head.x; this.camera.y = head.y;
    } else {
      this.camera.x += (head.x - this.camera.x) * smooth;
      this.camera.y += (head.y - this.camera.y) * smooth;
    }
    this.camera.zoom += (desiredZoom - this.camera.zoom) * smooth;
  }

  private drawBackdrop(width: number, height: number, now: number): void {
    const ctx = this.ctx;
    const base = ctx.createRadialGradient(width * .5, height * .42, 20, width * .5, height * .5, Math.max(width, height) * .78);
    base.addColorStop(0, "#0b1230");
    base.addColorStop(.48, "#070b1c");
    base.addColorStop(1, "#04060e");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    if (this.effects) {
      for (const n of this.nebulaSeed) {
        const x = (n.x * width + (-this.camera.x * .012)) % (width + n.radius * 2) - n.radius;
        const y = (n.y * height + (-this.camera.y * .012)) % (height + n.radius * 2) - n.radius;
        const g = ctx.createRadialGradient(x, y, 0, x, y, n.radius);
        g.addColorStop(0, `hsla(${n.hue},80%,55%,.045)`);
        g.addColorStop(1, `hsla(${n.hue},80%,45%,0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - n.radius, y - n.radius, n.radius * 2, n.radius * 2);
      }
    }

    const spacing = Math.max(34, 62 * this.camera.zoom);
    const ox = mod(-this.camera.x * this.camera.zoom, spacing);
    const oy = mod(-this.camera.y * this.camera.zoom, spacing);
    ctx.strokeStyle = "rgba(104,139,207,.052)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < width; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = oy; y < height; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();

    for (const s of this.starSeed) {
      const px = mod(s.x * width - this.camera.x * .025, width);
      const py = mod(s.y * height - this.camera.y * .025, height);
      const pulse = .82 + Math.sin(now * .0012 + s.x * 12) * .18;
      ctx.fillStyle = `rgba(202,225,255,${s.alpha * pulse})`;
      ctx.fillRect(px, py, s.size, s.size);
    }
  }

  private drawWorldBoundary(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, this.arenaRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(83,107,255,.24)";
    ctx.lineWidth = 44;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, this.arenaRadius - 20, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(112,225,255,.34)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, this.arenaRadius - 48, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(113,166,255,.08)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 26]);
    ctx.stroke();
    ctx.restore();
  }

  private drawFood(ctx: CanvasRenderingContext2D, foods: FoodSnapshot[], now: number): void {
    const viewX = this.canvas.clientWidth / this.camera.zoom * .65 + 260;
    const viewY = this.canvas.clientHeight / this.camera.zoom * .65 + 260;
    for (const f of foods) {
      if (Math.abs(f.x - this.camera.x) > viewX || Math.abs(f.y - this.camera.y) > viewY) continue;
      const r = 2.9 + f.value * 1.03;
      const hue = f.kind === 2 ? 43 : f.kind === 1 ? 302 : (f.id * 47) % 360;
      const pulse = 1 + Math.sin(now * .004 + f.id * .71) * (f.kind ? .13 : .06);
      if (this.effects && f.value >= 3) {
        ctx.fillStyle = `hsla(${hue},96%,67%,.13)`;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 3.3 * pulse, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `hsla(${hue},96%,68%,.23)`;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.05 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${hue},96%,73%)`;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * pulse, 0, Math.PI * 2); ctx.fill();
      if (f.kind === 2) {
        ctx.fillStyle = "rgba(255,255,230,.8)";
        ctx.beginPath(); ctx.arc(f.x - r * .24, f.y - r * .24, Math.max(1, r * .28), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private drawSnake(ctx: CanvasRenderingContext2D, s: SnakeSnapshot, isMe: boolean, now: number): void {
    if (s.body.length < 2) return;
    const head = s.body[0]!;
    const viewX = this.canvas.clientWidth / this.camera.zoom * .7 + 520;
    const viewY = this.canvas.clientHeight / this.camera.zoom * .7 + 520;
    if (!isMe && (Math.abs(head.x - this.camera.x) > viewX || Math.abs(head.y - this.camera.y) > viewY)) return;

    const palette = skinFor(s.skin);
    const radius = CONFIG.BODY_RADIUS + clamp((s.mass - CONFIG.START_MASS) * .012, 0, 4.2);
    const spawnAt = this.spawnFx.get(s.id);
    const spawnT = spawnAt ? clamp((now - spawnAt) / 650, 0, 1) : 1;
    if (spawnAt && spawnT >= 1) this.spawnFx.delete(s.id);

    ctx.save();
    ctx.globalAlpha = s.protected ? .72 + Math.sin(now * .018) * .18 : (.32 + spawnT * .68);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    traceBody(ctx, s.body);
    ctx.strokeStyle = withAlpha(palette.glow, this.effects ? .30 : .17);
    ctx.lineWidth = radius * (this.effects ? 3.4 : 2.7) * (.72 + spawnT * .28);
    ctx.stroke();

    traceBody(ctx, s.body);
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = radius * 2 * (.76 + spawnT * .24);
    ctx.stroke();

    traceBody(ctx, s.body);
    ctx.strokeStyle = withAlpha(palette.accent, .74);
    ctx.lineWidth = Math.max(2, radius * .34);
    ctx.stroke();

    this.drawPattern(ctx, s, palette, radius, now);

    const headScale = .7 + spawnT * .3;
    ctx.fillStyle = palette.body;
    ctx.beginPath(); ctx.arc(head.x, head.y, radius * 1.22 * headScale, 0, Math.PI * 2); ctx.fill();
    const headGlow = ctx.createRadialGradient(head.x, head.y, radius * .2, head.x, head.y, radius * 2.7);
    headGlow.addColorStop(0, withAlpha(palette.accent, .16));
    headGlow.addColorStop(1, withAlpha(palette.glow, 0));
    ctx.fillStyle = headGlow;
    ctx.beginPath(); ctx.arc(head.x, head.y, radius * 2.7, 0, Math.PI * 2); ctx.fill();

    const dx = Math.cos(s.angle), dy = Math.sin(s.angle), px = -dy, py = dx;
    const side = radius * .5, forward = radius * .58;
    for (const sign of [-1, 1]) {
      const ex = head.x + dx * forward + px * side * sign;
      const ey = head.y + dy * forward + py * side * sign;
      ctx.fillStyle = "#f8fbff";
      ctx.beginPath(); ctx.arc(ex, ey, radius * .30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0c1020";
      ctx.beginPath(); ctx.arc(ex + dx * radius * .1, ey + dy * radius * .1, radius * .13, 0, Math.PI * 2); ctx.fill();
    }

    if (s.boost && this.effects) {
      const tail = s.body[Math.min(s.body.length - 1, 7)]!;
      if (Math.random() < .7) {
        const rear = Math.atan2(head.y - s.body[1]!.y, head.x - s.body[1]!.x) + Math.PI;
        this.pushParticle(tail.x, tail.y, Math.cos(rear) * rand(25, 75) + rand(-18, 18), Math.sin(rear) * rand(25, 75) + rand(-18, 18), rand(.24, .46), rand(2.5, 7), Math.random() < .5 ? palette.glow : palette.accent, 2.1);
      }
    }

    ctx.font = `${isMe ? 750 : 620} ${isMe ? 13.5 : 12.5}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = isMe ? "rgba(255,255,255,.96)" : "rgba(235,242,255,.80)";
    ctx.shadowColor = "rgba(0,0,0,.65)";
    ctx.shadowBlur = 5;
    ctx.fillText(s.nickname, head.x, head.y - radius * 1.9);
    ctx.restore();
  }

  private drawPattern(ctx: CanvasRenderingContext2D, s: SnakeSnapshot, palette: SkinDefinition, radius: number, now: number): void {
    if (palette.pattern === "solid") return;
    const step = palette.pattern === "stripe" ? 4 : 6;
    for (let i = 3; i < s.body.length; i += step) {
      const p = s.body[i]!;
      let color = palette.secondary;
      let size = radius * .43;
      let alpha = .76;
      if (palette.pattern === "pulse") {
        size *= .75 + (Math.sin(now * .006 + i * .42) + 1) * .18;
        alpha = .55;
      } else if (palette.pattern === "dual") {
        color = (Math.floor(i / step) % 2 === 0) ? palette.secondary : palette.accent;
        size = radius * .48;
      } else if (palette.pattern === "spark") {
        size = radius * .25;
        alpha = .9;
      }
      ctx.fillStyle = withAlpha(color, alpha);
      ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
    }
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
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp; p.vy *= damp;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
  }

  private pushParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag: number): void {
    if (!this.effects) return;
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, drag });
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, width: number, height: number, me?: Vec2): void {
    const size = Math.min(124, Math.max(92, width * .155));
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const x = width - size - 18;
    const y = coarse ? 18 : height - size - 18;
    ctx.save();
    ctx.fillStyle = "rgba(4,8,22,.72)";
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(126,174,255,.42)";
    ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(126,174,255,.08)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * .32, 0, Math.PI * 2); ctx.stroke();
    if (me) {
      const px = x + size / 2 + (me.x / this.arenaRadius) * size * .43;
      const py = y + size / 2 + (me.y / this.arenaRadius) * size * .43;
      ctx.fillStyle = "rgba(133,250,255,.23)";
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#95fbff";
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawJoystick(ctx: CanvasRenderingContext2D, anchor: Vec2, knob: Vec2): void {
    ctx.save();
    ctx.globalAlpha = .56;
    ctx.fillStyle = "rgba(132,190,255,.08)";
    ctx.strokeStyle = "rgba(184,216,255,.68)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 54, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(156,241,255,.24)";
    ctx.strokeStyle = "rgba(182,249,255,.9)";
    ctx.beginPath(); ctx.arc(knob.x, knob.y, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawBoundaryWarning(width: number, height: number, me?: Vec2): void {
    if (!me) return;
    const distance = Math.hypot(me.x, me.y);
    const margin = this.arenaRadius - distance;
    if (margin > 640) return;
    const strength = clamp((640 - margin) / 640, 0, 1) * .22;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .28, width / 2, height / 2, Math.max(width, height) * .72);
    g.addColorStop(0, "rgba(116,82,255,0)");
    g.addColorStop(1, `rgba(102,67,255,${strength})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  }

  private drawReplayTreatment(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const scan = (now * .08) % 8;
    ctx.save();
    ctx.globalAlpha = .055;
    ctx.fillStyle = "#b3e6ff";
    for (let y = scan; y < height; y += 8) ctx.fillRect(0, y, width, 1);
    ctx.restore();
  }
}

function interpolateSnakes(prev: SnakeSnapshot[], next: SnakeSnapshot[], t: number): SnakeSnapshot[] {
  const prevMap = new Map(prev.map(s => [s.id, s]));
  return next.map(n => {
    const p = prevMap.get(n.id);
    if (!p) return n;
    const body: Vec2[] = n.body.map((point, i) => {
      const pp = p.body[Math.min(i, p.body.length - 1)] || point;
      return { x: pp.x + (point.x - pp.x) * t, y: pp.y + (point.y - pp.y) * t };
    });
    let angle = p.angle;
    let d = n.angle - p.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    angle += d * t;
    return { ...n, angle, body };
  });
}

function traceBody(ctx: CanvasRenderingContext2D, body: Vec2[]): void {
  ctx.beginPath();
  ctx.moveTo(body[0]!.x, body[0]!.y);
  if (body.length === 2) { ctx.lineTo(body[1]!.x, body[1]!.y); return; }
  for (let i = 1; i < body.length - 1; i++) {
    const p = body[i]!;
    const next = body[i + 1]!;
    ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) * .5, (p.y + next.y) * .5);
  }
  const tail = body[body.length - 1]!;
  ctx.lineTo(tail.x, tail.y);
}

function skinFor(id: string): SkinDefinition {
  return SKINS.find(s => s.id === id) ?? SKINS[0]!;
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) {
    const raw = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1);
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

function mod(v: number, m: number): number { return ((v % m) + m) % m; }
function rand(min: number, max: number): number { return min + Math.random() * (max - min); }
