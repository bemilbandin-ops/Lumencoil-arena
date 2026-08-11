import type { SnapshotMessage, Vec2 } from "../../shared/types.js";

export type RenderPair = { prev: SnapshotMessage; next: SnapshotMessage; t: number };
export type CameraState = { x: number; y: number; zoom: number };
export type GroundSpeck = Vec2 & { size: number; alpha: number };
export type VisualEnv = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: CameraState;
  arenaRadius: number;
  effects: boolean;
};
export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
};
