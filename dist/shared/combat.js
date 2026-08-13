import { levelFromMass } from "./match.js";
export function combatLevel(mass) {
    return levelFromMass(mass);
}
export function resolveHeadContact(attackerMass, defenderMass) {
    const attackerLevel = combatLevel(attackerMass);
    const defenderLevel = combatLevel(defenderMass);
    if (attackerLevel > defenderLevel)
        return "attacker";
    if (defenderLevel > attackerLevel)
        return "defender";
    return "none";
}
export function resolveBodyContact(attackerMass, defenderMass) {
    return combatLevel(attackerMass) > combatLevel(defenderMass) ? "attacker" : "none";
}
//# sourceMappingURL=combat.js.map