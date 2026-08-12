import { CONFIG } from "./config.js";
export function combatLevel(mass) {
    return Math.max(1, Math.floor((mass - CONFIG.START_MASS) * .85) + 1);
}
export function resolveHeadContact(attackerMass, defenderMass) {
    const attackerLevel = combatLevel(attackerMass);
    const defenderLevel = combatLevel(defenderMass);
    if (attackerLevel > defenderLevel)
        return "attacker";
    if (defenderLevel > attackerLevel)
        return "defender";
    return "both";
}
export function resolveBodyContact(attackerMass, defenderMass) {
    return combatLevel(attackerMass) > combatLevel(defenderMass) ? "attacker" : "defender";
}
//# sourceMappingURL=combat.js.map