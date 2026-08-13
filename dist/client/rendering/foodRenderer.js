const PEARL_VARIANTS = [
    { xScale: .91, yScale: 1.08, tilt: -.17, topBias: .10, sideBias: .05, highlightX: -.29, highlightY: -.34 },
    { xScale: 1.02, yScale: .96, tilt: .12, topBias: -.04, sideBias: -.08, highlightX: -.31, highlightY: -.29 },
    { xScale: .95, yScale: 1.03, tilt: -.04, topBias: .03, sideBias: .11, highlightX: -.25, highlightY: -.37 }
];
const AMBIENT_COLORS = [
    { shell: "#eeeaff", center: "#cfc6ff", accent: "#ffffff", outline: "#35265f", shadow: "rgba(28,18,58,.42)" },
    { shell: "#f5f3ff", center: "#d9d5ff", accent: "#ffffff", outline: "#28345f", shadow: "rgba(23,29,61,.40)" },
    { shell: "#e8e9ff", center: "#c5ccff", accent: "#ffffff", outline: "#30255a", shadow: "rgba(25,21,55,.40)" }
];
const RARE_COLORS = [
    { shell: "#f5efff", center: "#b786ff", accent: "#7c55ff", outline: "#30205f", shadow: "rgba(31,18,68,.48)" },
    { shell: "#f4f0ff", center: "#9fa8ff", accent: "#635cff", outline: "#283064", shadow: "rgba(24,28,72,.48)" },
    { shell: "#f8eeff", center: "#d18cff", accent: "#a14fff", outline: "#41205f", shadow: "rgba(48,19,66,.46)" }
];
const DEAD_COLORS = [
    { shell: "#d49aff", center: "#8f58e8", accent: "#ffd0ff", outline: "#2a164d", shadow: "rgba(31,13,55,.54)" },
    { shell: "#9e9dff", center: "#665bd8", accent: "#d9d7ff", outline: "#1e2552", shadow: "rgba(18,23,57,.54)" },
    { shell: "#d781df", center: "#9147c8", accent: "#ffc1ec", outline: "#351640", shadow: "rgba(43,14,47,.52)" }
];
const SPRITE_SIZE = 48;
const SPRITE_SCALE = 2;
const spriteCache = new Map();
export function drawFood(env, foods, now) {
    const { ctx, canvas, camera, effects } = env;
    const viewX = canvas.clientWidth / camera.zoom * .65 + 300, viewY = canvas.clientHeight / camera.zoom * .65 + 300;
    for (const f of foods) {
        if (Math.abs(f.x - camera.x) > viewX || Math.abs(f.y - camera.y) > viewY)
            continue;
        const variantIndex = Math.abs(f.id) % 3;
        const variant = PEARL_VARIANTS[variantIndex];
        const rarePulse = f.kind === 1 ? 1 + Math.sin(now * .0017 + variantIndex * 2.1) * .045 : 1;
        const kindScale = f.kind === 1 ? 1.22 : f.kind === 2 ? 1.10 : 1;
        const radius = (4.9 + Math.min(5.4, f.value * 1.15)) * kindScale;
        const colors = f.kind === 2 ? DEAD_COLORS[variantIndex] : f.kind === 1 ? RARE_COLORS[variantIndex] : AMBIENT_COLORS[variantIndex];
        const sprite = foodSprite(f, radius, variantIndex, variant, colors, effects);
        const size = SPRITE_SIZE * rarePulse;
        ctx.drawImage(sprite, f.x - size / 2, f.y - size / 2, size, size);
    }
}
function foodSprite(food, radius, variantIndex, variant, colors, effects) {
    const key = `${food.kind}:${food.value}:${variantIndex}:${food.kind === 1 && effects ? 1 : 0}`;
    const cached = spriteCache.get(key);
    if (cached)
        return cached;
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_SIZE * SPRITE_SCALE;
    canvas.height = SPRITE_SIZE * SPRITE_SCALE;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(SPRITE_SCALE, 0, 0, SPRITE_SCALE, canvas.width / 2, canvas.height / 2);
    drawPearl(ctx, { ...food, x: 0, y: 0 }, radius, variant, colors, effects);
    spriteCache.set(key, canvas);
    return canvas;
}
function drawPearl(ctx, food, radius, variant, colors, effects) {
    ctx.save();
    ctx.translate(food.x, food.y);
    ctx.rotate(variant.tilt);
    if (food.kind === 1 && effects) {
        ctx.globalAlpha = .11;
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.48, radius * 1.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = colors.shadow;
    ctx.beginPath();
    ctx.ellipse(radius * .22, radius * .57, radius * .83, radius * .39, .05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.shell;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = Math.max(1.5, radius * .19);
    tracePearl(ctx, radius, variant);
    ctx.fill();
    ctx.stroke();
    const centerScale = food.kind === 1 ? .62 : food.kind === 2 ? .57 : .46;
    ctx.fillStyle = colors.center;
    ctx.beginPath();
    ctx.ellipse(radius * .08, radius * .10, radius * centerScale, radius * (centerScale + .07), -.08, 0, Math.PI * 2);
    ctx.fill();
    if (food.kind !== 0) {
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.ellipse(radius * .13, radius * .08, radius * .25, radius * .30, -.12, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.beginPath();
    ctx.ellipse(radius * variant.highlightX, radius * variant.highlightY, Math.max(1.05, radius * .22), Math.max(1.25, radius * .30), -.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.34)";
    ctx.beginPath();
    ctx.ellipse(radius * (variant.highlightX + .20), radius * (variant.highlightY + .12), Math.max(.65, radius * .10), Math.max(.7, radius * .13), -.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
function tracePearl(ctx, radius, variant) {
    const rx = radius * variant.xScale;
    const ry = radius * variant.yScale;
    const top = -ry * (1 + variant.topBias);
    const right = rx * (1 + variant.sideBias);
    const left = -rx * (1 - variant.sideBias * .45);
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.bezierCurveTo(right * .58, top * .93, right * 1.02, -ry * .28, right, ry * .17);
    ctx.bezierCurveTo(right * .96, ry * .72, rx * .48, ry * 1.02, -rx * .08, ry);
    ctx.bezierCurveTo(left * .58, ry * .97, left * 1.02, ry * .55, left, -ry * .04);
    ctx.bezierCurveTo(left * .94, -ry * .50, left * .52, top * .90, 0, top);
    ctx.closePath();
}
//# sourceMappingURL=foodRenderer.js.map