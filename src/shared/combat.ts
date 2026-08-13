import { levelFromMass } from "./match.js";

export type HeadContactOutcome = "attacker" | "defender" | "none";
export type BodyContactOutcome = "attacker" | "none";

export function combatLevel(mass: number): number {
  return levelFromMass(mass);
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
