import { CONFIG } from "./config.js";
export function levelFromMass(mass) {
    return Math.max(1, Math.floor((mass - CONFIG.START_MASS) / CONFIG.LEVEL_MASS_STEP) + 1);
}
export function massForLevel(level) {
    return CONFIG.START_MASS + (Math.max(1, Math.floor(level)) - 1) * CONFIG.LEVEL_MASS_STEP;
}
//# sourceMappingURL=match.js.map