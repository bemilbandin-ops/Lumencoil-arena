import { CONFIG, type SkinDefinition } from "../shared/config.js";
import { clamp, type FoodSnapshot, type SnakeSnapshot, type Vec2 } from "../shared/types.js";
import { darken, foodPalette, mod, rand, skinFor, traceBody, withAlpha } from "./rendererUtils.js";

export type CameraState = { x: number; y: number; zoom: number };
export type GroundSpeck = Vec2 & { size: number; alpha: number };
export type VisualEnv = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: CameraState;
  arenaRadius: number;
  effects: boolean;
};
export type ParticleEmitter = (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, drag: number) => void;

export function drawBackdrop(env: VisualEnv, width: number, height: number, now: number, specks: GroundSpeck[]): void {
  const { ctx, camera } = env;
  const floor = ctx.createLinearGradient(0, 0, 0, height);
  floor.addColorStop(0, "#20252b"); floor.addColorStop(.55, "#252a30"); floor.addColorStop(1, "#1c2025");
  ctx.fillStyle = floor; ctx.fillRect(0, 0, width, height);

  const halo = ctx.createRadialGradient(width * .46, height * .42, 0, width * .46, height * .42, Math.max(width, height) * .8);
  halo.addColorStop(0, "rgba(255,255,255,.035)"); halo.addColorStop(.62, "rgba(255,255,255,.008)"); halo.addColorStop(1, "rgba(0,0,0,.13)");
  ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < specks.length; i++) {
    const s = specks[i]!;
    const px = mod(s.x * width - camera.x * .032, width);
    const py = mod(s.y * height - camera.y * .032, height);
    const pulse = .84 + Math.sin(now * .0008 + s.x * 15) * .16;
    ctx.fillStyle = i % 7 === 0 ? `rgba(160,42,45,${s.alpha * pulse})` : `rgba(232,238,244,${s.alpha * .55 * pulse})`;
    ctx.beginPath(); ctx.arc(px, py, s.size, 0, Math.PI * 2); ctx.fill();
  }

  const spacing = Math.max(74, 94 * camera.zoom);
  const ox = mod(-camera.x * camera.zoom, spacing), oy = mod(-camera.y * camera.zoom, spacing);
  ctx.fillStyle = "rgba(255,255,255,.034)";
  for (let x = ox; x < width; x += spacing) for (let y = oy; y < height; y += spacing) ctx.fillRect(x, y, 1, 1);
}

export function drawWorldBoundary(ctx: CanvasRenderingContext2D, arenaRadius: number): void {
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, arenaRadius, 0, Math.PI * 2); ctx.strokeStyle = "#11151a"; ctx.lineWidth = 56; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, arenaRadius - 5, 0, Math.PI * 2); ctx.strokeStyle = "#5d636b"; ctx.lineWidth = 23; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, arenaRadius - 5, 0, Math.PI * 2); ctx.strokeStyle = "rgba(238,242,245,.72)"; ctx.lineWidth = 7; ctx.setLineDash([24, 20]); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, arenaRadius - 25, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,96,58,.38)"; ctx.lineWidth = 3; ctx.setLineDash([12, 28]); ctx.stroke();
  ctx.restore();
}

export function drawFood(env: VisualEnv, foods: FoodSnapshot[], now: number): void {
  const { ctx, canvas, camera, effects } = env;
  const viewX = canvas.clientWidth / camera.zoom * .65 + 300, viewY = canvas.clientHeight / camera.zoom * .65 + 300;
  for (const f of foods) {
    if (Math.abs(f.x - camera.x) > viewX || Math.abs(f.y - camera.y) > viewY) continue;
    const pulse = 1 + Math.sin(now * .0042 + f.id * .53) * (f.kind ? .08 : .035);
    const r = (4.8 + Math.min(5.8, f.value * 1.24)) * pulse;
    const palette = foodPalette(f);
    if (effects && f.value >= 3) { ctx.fillStyle = withAlpha(palette.glow, .10); ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(f.x + r * .22, f.y + r * .72, r * .92, r * .46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(18,19,27,.74)"; ctx.lineWidth = Math.max(1.4, r * .16); ctx.fillStyle = palette.base;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, r * .88, r * 1.02, -.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = palette.inner; ctx.beginPath(); ctx.ellipse(f.x + r * .10, f.y + r * .12, r * .48, r * .57, -.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.80)"; ctx.beginPath(); ctx.ellipse(f.x - r * .24, f.y - r * .3, Math.max(1.1, r * .22), Math.max(1.3, r * .29), -.45, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawSnake(env: VisualEnv, s: SnakeSnapshot, isMe: boolean, now: number, spawnT: number, emit: ParticleEmitter): void {
  if (s.body.length < 2) return;
  const { ctx, canvas, camera, effects } = env;
  const head = s.body[0]!;
  const viewX = canvas.clientWidth / camera.zoom * .73 + 640, viewY = canvas.clientHeight / camera.zoom * .73 + 640;
  if (!isMe && (Math.abs(head.x - camera.x) > viewX || Math.abs(head.y - camera.y) > viewY)) return;

  const palette = skinFor(s.skin);
  const radius = CONFIG.BODY_RADIUS + 2.15 + clamp((s.mass - CONFIG.START_MASS) * .016, 0, 6.2);
  ctx.save();
  const protectedPulse = s.protected ? .93 + Math.sin(now * .006) * .035 : 1;
  ctx.globalAlpha = (.38 + spawnT * .62) * protectedPulse;
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  ctx.save(); ctx.translate(3.5, 5); traceBody(ctx, s.body); ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = radius * 2.95; ctx.stroke(); ctx.restore();
  traceBody(ctx, s.body); ctx.strokeStyle = "#101218"; ctx.lineWidth = radius * 2.80; ctx.stroke();
  traceBody(ctx, s.body); ctx.strokeStyle = darken(palette.body, .34); ctx.lineWidth = radius * 2.46; ctx.stroke();
  traceBody(ctx, s.body); ctx.strokeStyle = palette.body; ctx.lineWidth = radius * 2.08; ctx.stroke();

  const step = s.body.length > 120 ? 3 : 2;
  for (let i = s.body.length - 2; i >= 2; i -= step) drawBodySegment(ctx, s.body[i]!, i, radius, palette, now);
  drawHead(ctx, s, radius, palette, now, spawnT, effects);

  if (s.boost && effects) {
    const tail = s.body[Math.min(s.body.length - 1, 8)]!;
    if (Math.random() < .72) {
      const rear = Math.atan2(head.y - s.body[1]!.y, head.x - s.body[1]!.x) + Math.PI;
      emit(tail.x, tail.y, Math.cos(rear) * rand(35, 95) + rand(-24, 24), Math.sin(rear) * rand(35, 95) + rand(-24, 24), rand(.22, .48), rand(3, 7), Math.random() < .5 ? palette.glow : palette.accent, 2.2);
    }
  }
  drawLabel(ctx, s, radius, isMe, camera.zoom);
  ctx.restore();
}

function drawBodySegment(ctx: CanvasRenderingContext2D, p: Vec2, index: number, radius: number, palette: SkinDefinition, now: number): void {
  const band = Math.floor(index / 4) % 2;
  const accentBand = palette.pattern === "stripe" ? band === 0 : palette.pattern === "dual" ? band === 1 : false;
  const rr = radius * (.94 + Math.sin(index * .83) * .018), bodyColor = accentBand ? palette.secondary : palette.body;
  ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.beginPath(); ctx.arc(p.x + rr * .12, p.y + rr * .20, rr * 1.02, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(10,11,16,.84)"; ctx.lineWidth = Math.max(1.6, rr * .15); ctx.fillStyle = bodyColor; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = withAlpha(palette.secondary, palette.pattern === "spark" ? .44 : .24); ctx.beginPath(); ctx.arc(p.x + rr * .25, p.y + rr * .28, rr * .58, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.ellipse(p.x - rr * .28, p.y - rr * .32, rr * .30, rr * .17, -.55, 0, Math.PI * 2); ctx.fill();
  if (palette.pattern === "pulse") { const pulse = .35 + (Math.sin(now * .005 + index * .46) + 1) * .17; ctx.fillStyle = withAlpha(palette.accent, pulse); ctx.beginPath(); ctx.arc(p.x, p.y, rr * .22, 0, Math.PI * 2); ctx.fill(); }
  else if (palette.pattern === "spark" && index % 6 === 0) { ctx.fillStyle = withAlpha(palette.accent, .9); ctx.beginPath(); ctx.arc(p.x - rr * .1, p.y - rr * .08, rr * .19, 0, Math.PI * 2); ctx.fill(); }
}

function drawHead(ctx: CanvasRenderingContext2D, s: SnakeSnapshot, radius: number, palette: SkinDefinition, now: number, spawnT: number, effects: boolean): void {
  const head = s.body[0]!, angle = s.angle, scale = .72 + spawnT * .28;
  const headLength = radius * 1.62 * scale, headWidth = radius * 1.33 * scale;
  ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(angle);
  ctx.fillStyle = "#101218";
  for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-radius * .12, sign * headWidth * .72); ctx.lineTo(-radius * .78, sign * headWidth * 1.24); ctx.lineTo(radius * .26, sign * headWidth * .78); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = darken(palette.secondary, .2);
  for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-radius * .18, sign * headWidth * .67); ctx.lineTo(-radius * .66, sign * headWidth * 1.04); ctx.lineTo(radius * .14, sign * headWidth * .72); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.beginPath(); ctx.ellipse(radius * .16, radius * .22, headLength * 1.05, headWidth * 1.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0f1117"; ctx.lineWidth = Math.max(2, radius * .18); ctx.fillStyle = palette.body; ctx.beginPath(); ctx.ellipse(0, 0, headLength, headWidth, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = withAlpha(palette.secondary, .5); ctx.beginPath(); ctx.ellipse(-radius * .18, radius * .25, headLength * .72, headWidth * .63, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.ellipse(radius * .16, -radius * .36, headLength * .52, headWidth * .24, -.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = withAlpha(palette.accent, .68); ctx.beginPath(); ctx.moveTo(radius * .98, 0); ctx.lineTo(radius * .23, -radius * .31); ctx.lineTo(-radius * .16, 0); ctx.lineTo(radius * .23, radius * .31); ctx.closePath(); ctx.fill();
  for (const sign of [-1, 1]) { const ex = radius * .58, ey = sign * radius * .58; ctx.fillStyle = "#090a0f"; ctx.beginPath(); ctx.ellipse(ex, ey, radius * .35, radius * .28, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#f8fbff"; ctx.beginPath(); ctx.ellipse(ex + radius * .04, ey, radius * .24, radius * .19, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#15171f"; ctx.beginPath(); ctx.arc(ex + radius * .14, ey, radius * .095, 0, Math.PI * 2); ctx.fill(); }
  if (effects) { ctx.strokeStyle = withAlpha(palette.glow, .12 + Math.sin(now * .004) * .025); ctx.lineWidth = radius * .38; ctx.beginPath(); ctx.ellipse(0, 0, headLength * 1.13, headWidth * 1.16, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, s: SnakeSnapshot, radius: number, isMe: boolean, zoom: number): void {
  const head = s.body[0]!, invZoom = 1 / zoom;
  const level = Math.max(1, Math.floor((s.mass - CONFIG.START_MASS) * .85) + 1);
  const nameSize = (isMe ? 17 : 12.5) * invZoom, levelSize = (isMe ? 11 : 8.5) * invZoom, y = head.y - radius * 2.05 - 10 * invZoom;
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
  ctx.font = `900 ${levelSize}px system-ui, sans-serif`; ctx.strokeStyle = "rgba(0,0,0,.88)"; ctx.lineWidth = Math.max(2, 3.5 * invZoom); ctx.strokeText(`Lv${level}`, head.x, y - nameSize * .92); ctx.fillStyle = isMe ? "#ffe574" : "rgba(235,239,244,.9)"; ctx.fillText(`Lv${level}`, head.x, y - nameSize * .92);
  ctx.font = `950 ${nameSize}px system-ui, sans-serif`; ctx.strokeStyle = "rgba(0,0,0,.92)"; ctx.lineWidth = Math.max(3, 5.5 * invZoom); ctx.strokeText(s.nickname, head.x, y); ctx.fillStyle = isMe ? "#fff" : "rgba(247,248,250,.95)"; ctx.fillText(s.nickname, head.x, y);
}

export function drawMinimap(ctx: CanvasRenderingContext2D, width: number, height: number, arenaRadius: number, me?: Vec2): void {
  const size = Math.min(106, Math.max(82, width * .13));
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const x = width - size - 18, y = coarse ? 154 : height - size - 18;
  ctx.save(); ctx.fillStyle = "rgba(13,15,18,.70)"; ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.46)"; ctx.lineWidth = 2; ctx.stroke();
  if (me) { const px = x + size / 2 + (me.x / arenaRadius) * size * .43, py = y + size / 2 + (me.y / arenaRadius) * size * .43; ctx.fillStyle = "rgba(255,226,92,.25)"; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffe25e"; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function drawJoystick(ctx: CanvasRenderingContext2D, anchor: Vec2, knob: Vec2): void {
  ctx.save(); ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.strokeStyle = "rgba(255,255,255,.58)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 54, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.strokeStyle = "rgba(255,255,255,.82)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(knob.x, knob.y, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
}

export function drawBoundaryWarning(ctx: CanvasRenderingContext2D, width: number, height: number, arenaRadius: number, me?: Vec2): void {
  if (!me) return; const margin = arenaRadius - Math.hypot(me.x, me.y); if (margin > 640) return;
  const strength = clamp((640 - margin) / 640, 0, 1) * .22;
  const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .28, width / 2, height / 2, Math.max(width, height) * .72);
  g.addColorStop(0, "rgba(170,24,22,0)"); g.addColorStop(1, `rgba(190,37,31,${strength})`); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
}
