export type Vec2 = { x: number; y: number };
export type BotProfile = "PASSIVE" | "NORMAL" | "AGGRESSIVE" | "GREEDY" | "CAUTIOUS";

export type SnakeSnapshot = {
  id: string;
  nickname: string;
  skin: string;
  mass: number;
  score: number;
  kills: number;
  angle: number;
  boost: boolean;
  protected: boolean;
  body: Vec2[];
};

export type FoodSnapshot = Vec2 & { id: number; value: number; kind: number };
export type LeaderboardEntry = { id: string; nickname: string; score: number };

export type WorldEvent =
  | { id: number; at: number; type: "collect"; eaterId: string; x: number; y: number; value: number; kind: number }
  | { id: number; at: number; type: "death"; snakeId: string; killerId: string | null; x: number; y: number; skin: string; mass: number }
  | { id: number; at: number; type: "spawn"; snakeId: string; x: number; y: number; skin: string };

export type SelfStats = {
  score: number;
  mass: number;
  rank: number;
  kills: number;
  survivalSeconds: number;
};

export type SnapshotMessage = {
  type: "snapshot";
  serverTime: number;
  snakes: SnakeSnapshot[];
  foods: FoodSnapshot[];
  leaderboard: LeaderboardEntry[];
  you: SelfStats;
  events: WorldEvent[];
};

export type DeathStats = {
  score: number;
  mass: number;
  survivalSeconds: number;
  kills: number;
};

export type ServerMessage =
  | { type: "welcome"; playerId: string; arenaRadius: number; resumeToken: string; resumed: boolean }
  | SnapshotMessage
  | { type: "death"; stats: DeathStats }
  | { type: "ping"; at: number }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "join"; nickname: string; skin: string; resumeToken?: string }
  | { type: "input"; seq: number; angle: number; boost: boolean }
  | { type: "respawn" }
  | { type: "leave" }
  | { type: "pong"; at: number };

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}
