import { clamp } from "../../shared/types.js";
import { mod } from "./renderMath.js";
export function drawBackdrop(env, width, height, _now, specks) {
    const { ctx, camera } = env;
    ctx.fillStyle = "#111315";
    ctx.fillRect(0, 0, width, height);
    const textureWidth = width + 180, textureHeight = height + 180;
    for (let i = 0; i < specks.length; i += 5) {
        const s = specks[i];
        const px = mod(s.x * textureWidth - camera.x * .018, textureWidth) - 90;
        const py = mod(s.y * textureHeight - camera.y * .018, textureHeight) - 90;
        const rx = 9 + ((i * 7) % 17), ry = 5 + ((i * 11) % 12);
        ctx.fillStyle = i % 10 === 0 ? "rgba(255,255,255,.010)" : "rgba(0,0,0,.022)";
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, (s.x - .5) * .7, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let i = 0; i < specks.length; i += 13) {
        const s = specks[i];
        const px = mod(s.x * width - camera.x * .035, width);
        const py = mod(s.y * height - camera.y * .035, height);
        const size = Math.max(.45, Math.min(1.15, s.size * .55));
        ctx.fillStyle = `rgba(205,210,214,${.035 + s.alpha * .34})`;
        ctx.fillRect(px, py, size, size);
    }
    const vignette = ctx.createRadialGradient(width * .5, height * .46, Math.min(width, height) * .12, width * .5, height * .5, Math.max(width, height) * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(.68, "rgba(0,0,0,.035)");
    vignette.addColorStop(1, "rgba(0,0,0,.26)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}
export function drawWorldBoundary(ctx, arenaRadius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius + 48, 0, Math.PI * 2);
    ctx.strokeStyle = "#07090b";
    ctx.lineWidth = 96;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#15181b";
    ctx.lineWidth = 30;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#252a2e";
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 12, 0, Math.PI * 2);
    ctx.strokeStyle = "#3b4146";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 15, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(205,211,216,.46)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}
export function drawMinimap(ctx, width, height, arenaRadius, me) {
    const size = Math.min(106, Math.max(82, width * .13));
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const x = width - size - 18, y = coarse ? 154 : height - size - 18;
    ctx.save();
    ctx.fillStyle = "rgba(13,15,18,.70)";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.46)";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (me) {
        const px = x + size / 2 + (me.x / arenaRadius) * size * .43, py = y + size / 2 + (me.y / arenaRadius) * size * .43;
        ctx.fillStyle = "rgba(255,226,92,.25)";
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffe25e";
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
export function drawBoundaryWarning(ctx, width, height, arenaRadius, me) {
    if (!me)
        return;
    const margin = arenaRadius - Math.hypot(me.x, me.y);
    if (margin > 640)
        return;
    const strength = clamp((640 - margin) / 640, 0, 1) * .22;
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .28, width / 2, height / 2, Math.max(width, height) * .72);
    g.addColorStop(0, "rgba(170,24,22,0)");
    g.addColorStop(1, `rgba(190,37,31,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
}
//# sourceMappingURL=arenaRenderer.js.map
