import { SKINS, type SkinDefinition } from "../../shared/config.js";
import type { FoodSnapshot, SnakeSnapshot, Vec2 } from "../../shared/types.js";

export function interpolateSnakes(prev: SnakeSnapshot[], next: SnakeSnapshot[], t: number): SnakeSnapshot[] {
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

export function traceBody(ctx: CanvasRenderingContext2D, body: Vec2[]): void {
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

export function skinFor(id: string): SkinDefinition {
  return SKINS.find(s => s.id === id) ?? SKINS[0]!;
}

export function foodPalette(food: FoodSnapshot): { base: string; inner: string; glow: string } {
  if (food.kind === 2) return { base: "#ffb642", inner: "#ffe99a", glow: "#ffb21f" };
  if (food.kind === 1) return { base: "#b695ff", inner: "#f0e8ff", glow: "#b77cff" };
  const variants = [
    { base: "#c8c2ff", inner: "#f7f5ff", glow: "#9187ff" },
    { base: "#d8d6ff", inner: "#ffffff", glow: "#b4a8ff" },
    { base: "#b9c8ff", inner: "#f3f6ff", glow: "#839cff" }
  ];
  return variants[Math.abs(food.id) % variants.length]!;
}

export function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) {
    const raw = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1);
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

export function darken(hex: string, amount: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount));
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount));
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

export function mod(v: number, m: number): number { return ((v % m) + m) % m; }
export function rand(min: number, max: number): number { return min + Math.random() * (max - min); }
