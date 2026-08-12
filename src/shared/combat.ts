import { CONFIG } from "./config.js";

export type HeadContactOutcome = "attacker" | "defender" | "none";
export type BodyContactOutcome = "attacker" | "none";

export function combatLevel(mass: number): number {
  return Math.max(1, Math.floor((mass - CONFIG.START_MASS) * .85) + 1);
}

export function resolveHeadContact(attackerMass: number, defenderMass: number): HeadContactOutcome {
  const attackerLevel = combatLevel(attackerMass);
  const defenderLevel = combatLevel(defenderMass);
  if (attackerLevel > defenderLevel) return "attacker";
  if (defenderLevel > attackerLevel) return "defender";
  return "none";
}

export function resolveBodyContact(attackerMass: number, defenderMass: number): BodyContactOutcome {
  return combatLevel(attackerMass) > combatLevel(defenderMass) ? "attacker" : "none";
}
