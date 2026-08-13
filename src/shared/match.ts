import { CONFIG } from "./config.js";

export type MatchPhase = "GROWTH" | "BOSS" | "RESULT";
export type MatchResult = "WIN" | "DEFEAT" | null;

export type MatchSnapshot = {
  phase: MatchPhase;
  remainingMs: number;
  result: MatchResult;
  bossId: string | null;
  bossLevel: number | null;
};

export function levelFromMass(mass: number): number {
  return Math.max(1, Math.floor((mass - CONFIG.START_MASS) / CONFIG.LEVEL_MASS_STEP) + 1);
}

export function massForLevel(level: number): number {
  return CONFIG.START_MASS + (Math.max(1, Math.floor(level)) - 1) * CONFIG.LEVEL_MASS_STEP;
}
