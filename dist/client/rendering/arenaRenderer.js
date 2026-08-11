import { clamp } from "../../shared/types.js";
import { mod } from "./renderMath.js";
export function drawBackdrop(env, width, height, now, specks) {
    const { ctx, camera } = env;
    const floor = ctx.createLinearGradient(0, 0, 0, height);
    floor.addColorStop(0, "#20252b");
    floor.addColorStop(.55, "#252a30");
    floor.addColorStop(1, "#1c2025");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, width, height);
    const halo = ctx.createRadialGradient(width * .46, height * .42, 0, width * .46, height * .42, Math.max(width, height) * .8);
    halo.addColorStop(0, "rgba(255,255,255,.035)");
    halo.addColorStop(.62, "rgba(255,255,255,.008)");
    halo.addColorStop(1, "rgba(0,0,0,.13)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < specks.length; i++) {
        const s = specks[i];
        const px = mod(s.x * width - camera.x * .032, width);
        const py = mod(s.y * height - camera.y * .032, height);
        const pulse = .84 + Math.sin(now * .0008 + s.x * 15) * .16;
        ctx.fillStyle = i % 7 === 0 ? `rgba(160,42,45,${s.alpha * pulse})` : `rgba(232,238,244,${s.alpha * .55 * pulse})`;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fill();
    }
    const spacing = Math.max(74, 94 * camera.zoom);
    const ox = mod(-camera.x * camera.zoom, spacing), oy = mod(-camera.y * camera.zoom, spacing);
    ctx.fillStyle = "rgba(255,255,255,.034)";
    for (let x = ox; x < width; x += spacing)
        for (let y = oy; y < height; y += spacing)
            ctx.fillRect(x, y, 1, 1);
}
export function drawWorldBoundary(ctx, arenaRadius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#11151a";
    ctx.lineWidth = 56;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#5d636b";
    ctx.lineWidth = 23;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(238,242,245,.72)";
    ctx.lineWidth = 7;
    ctx.setLineDash([24, 20]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, arenaRadius - 25, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,96,58,.38)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 28]);
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