import { CONFIG } from "../shared/config.js";
import { combatLevel } from "../shared/combat.js";
import { clamp, normalizeAngle } from "../shared/types.js";
export function decideBot(self, brain, bodies, foods, snakes) {
    const look = CONFIG.BOT_VIEW_DISTANCE + (brain.profile === "CAUTIOUS" ? 160 : 0);
    const futureX = self.x + Math.cos(self.angle) * CONFIG.BASE_SPEED * brain.prediction;
    const futureY = self.y + Math.sin(self.angle) * CONFIG.BASE_SPEED * brain.prediction;
    let avoidX = 0;
    let avoidY = 0;
    let danger = 0;
    const safetyScale = 1.28 - brain.risk * .48;
    const selfLevel = combatLevel(self.mass);
    for (const p of bodies) {
        if (p.snakeId === self.id)
            continue;
        const dx = futureX - p.x;
        const dy = futureY - p.y;
        const d = Math.hypot(dx, dy);
        const threshold = CONFIG.BOT_EMERGENCY_DISTANCE * safetyScale;
        if (d <= .001 || d >= threshold)
            continue;
        const w = Math.pow(1 - d / threshold, 1.45) * 2.25;
        avoidX += dx / d * w;
        avoidY += dy / d * w;
        danger += w;
    }
    for (const other of snakes) {
        if (!other.alive || other.id === self.id)
            continue;
        const dx = other.x - self.x;
        const dy = other.y - self.y;
        const d = Math.hypot(dx, dy);
        if (d < .001)
            continue;
        if (d < CONFIG.BOT_CLUSTER_RADIUS) {
            const spread = (1 - d / CONFIG.BOT_CLUSTER_RADIUS) * CONFIG.BOT_CLUSTER_STRENGTH;
            avoidX -= dx / d * spread;
            avoidY -= dy / d * spread;
            danger += spread * .55;
        }
        if (d > CONFIG.BOT_HEAD_DANGER_DISTANCE * safetyScale)
            continue;
        const otherLevel = combatLevel(other.mass);
        const huntingLowerLevel = selfLevel > otherLevel && brain.aggression > .42 && brain.profile !== "PASSIVE";
        if (huntingLowerLevel)
            continue;
        const otherVx = Math.cos(other.angle) * (other.boost ? CONFIG.BOOST_SPEED : CONFIG.BASE_SPEED);
        const otherVy = Math.sin(other.angle) * (other.boost ? CONFIG.BOOST_SPEED : CONFIG.BASE_SPEED);
        const selfVx = Math.cos(self.angle) * CONFIG.BASE_SPEED;
        const selfVy = Math.sin(self.angle) * CONFIG.BASE_SPEED;
        const closing = -((dx / d) * (otherVx - selfVx) + (dy / d) * (otherVy - selfVy));
        const sizeThreat = otherLevel > selfLevel ? 1.45 : otherLevel === selfLevel ? 1.05 : .35;
        const w = clamp((CONFIG.BOT_HEAD_DANGER_DISTANCE - d) / CONFIG.BOT_HEAD_DANGER_DISTANCE, 0, 1)
            * (closing > -20 ? 1.2 : .65) * sizeThreat * safetyScale;
        if (w > .05) {
            avoidX -= dx / d * w;
            avoidY -= dy / d * w;
            danger += w;
        }
    }
    const futureCenter = Math.hypot(futureX, futureY);
    const boundaryMargin = CONFIG.ARENA_RADIUS - futureCenter;
    if (boundaryMargin < CONFIG.BOT_BOUNDARY_MARGIN) {
        const w = clamp((CONFIG.BOT_BOUNDARY_MARGIN - boundaryMargin) / CONFIG.BOT_BOUNDARY_MARGIN, 0, 1) * 3;
        avoidX += (-futureX / Math.max(futureCenter, 1)) * w;
        avoidY += (-futureY / Math.max(futureCenter, 1)) * w;
        danger += w;
    }
    const emergencyThreshold = brain.profile === "CAUTIOUS" ? .14 : .28 + brain.risk * .12;
    if (danger > emergencyThreshold) {
        return { angle: Math.atan2(avoidY, avoidX) + rand(-brain.steeringNoise, brain.steeringNoise), boost: danger > 1.15 && self.mass > CONFIG.MIN_BOOST_MASS + 8 };
    }
    let bestFood = null;
    let bestFoodScore = -Infinity;
    for (const food of foods) {
        const dx = food.x - self.x;
        const dy = food.y - self.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > look)
            continue;
        const deadBonus = food.kind === 2 ? 2.45 : 1;
        const rareBonus = food.kind === 1 ? 1.28 : 1;
        const profileBonus = brain.profile === "GREEDY" ? 1.28 : 1;
        const score = food.value * deadBonus * rareBonus * brain.foodAttraction * profileBonus / (45 + d);
        if (score > bestFoodScore) {
            bestFoodScore = score;
            bestFood = food;
        }
    }
    let prey = null;
    let preyScore = 0;
    if (brain.aggression > .42 && brain.profile !== "PASSIVE") {
        for (const other of snakes) {
            if (!other.alive || other.id === self.id || combatLevel(other.mass) >= selfLevel)
                continue;
            const dx = other.x - self.x;
            const dy = other.y - self.y;
            const d = Math.hypot(dx, dy);
            if (d < 70 || d > look)
                continue;
            const sizeAdvantage = clamp(self.mass / Math.max(other.mass, 1) - 1, 0, 1.5);
            const score = brain.aggression * (1 - d / look) * (1 + sizeAdvantage) * (.75 + brain.risk * .5);
            if (score > preyScore) {
                preyScore = score;
                prey = other;
            }
        }
    }
    if (prey && preyScore > Math.max(.13, bestFoodScore * 1.35)) {
        const lead = clamp(brain.preferredEnemyDistance * .33, 45, 135);
        const tx = prey.x + Math.cos(prey.angle) * lead;
        const ty = prey.y + Math.sin(prey.angle) * lead;
        return { angle: Math.atan2(ty - self.y, tx - self.x) + rand(-brain.steeringNoise, brain.steeringNoise), boost: self.mass > CONFIG.MIN_BOOST_MASS + 12 && Math.random() < brain.boostTendency * (.65 + brain.risk * .45) };
    }
    if (bestFood) {
        const d = Math.hypot(bestFood.x - self.x, bestFood.y - self.y);
        const chaseBoost = bestFood.kind === 2 && d < 430 && self.mass > CONFIG.MIN_BOOST_MASS + 9;
        return { angle: Math.atan2(bestFood.y - self.y, bestFood.x - self.x) + rand(-brain.steeringNoise, brain.steeringNoise), boost: chaseBoost && Math.random() < brain.boostTendency };
    }
    let headingDelta = normalizeAngle(brain.wanderHeading - self.angle);
    if (Math.abs(headingDelta) < .18 && Math.random() < .32) {
        brain.wanderHeading = normalizeAngle(brain.wanderHeading + rand(-.7, .7));
        headingDelta = normalizeAngle(brain.wanderHeading - self.angle);
    }
    else if (Math.random() < .12) {
        brain.wanderHeading = normalizeAngle(brain.wanderHeading + rand(-.16, .16));
        headingDelta = normalizeAngle(brain.wanderHeading - self.angle);
    }
    const correction = clamp(headingDelta, -.62, .62);
    return { angle: normalizeAngle(self.angle + correction + rand(-brain.steeringNoise * 1.2, brain.steeringNoise * 1.2)), boost: false };
}
export function createBrain(profile) {
    return {
        profile,
        reaction: rand(CONFIG.BOT_REACTION_MIN, CONFIG.BOT_REACTION_MAX),
        timer: rand(0, .2),
        aggression: profile === "AGGRESSIVE" ? rand(.74, 1) : profile === "PASSIVE" ? rand(.04, .24) : profile === "CAUTIOUS" ? rand(.12, .45) : rand(.3, .7),
        risk: profile === "CAUTIOUS" ? rand(.05, .2) : profile === "AGGRESSIVE" ? rand(.58, .92) : rand(.22, .7),
        foodAttraction: profile === "GREEDY" ? rand(1.6, 2.2) : rand(.82, 1.4),
        boostTendency: profile === "AGGRESSIVE" ? rand(.5, .88) : profile === "CAUTIOUS" ? rand(.08, .28) : rand(.12, .52),
        preferredEnemyDistance: rand(180, 410),
        steeringNoise: rand(.012, .095),
        prediction: rand(.24, .5),
        wanderHeading: rand(-Math.PI, Math.PI)
    };
}
function rand(min, max) { return min + Math.random() * (max - min); }
//# sourceMappingURL=botAI.js.map