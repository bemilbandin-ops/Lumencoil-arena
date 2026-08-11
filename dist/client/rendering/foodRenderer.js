import { foodPalette, withAlpha } from "./renderMath.js";
export function drawFood(env, foods, now) {
    const { ctx, canvas, camera, effects } = env;
    const viewX = canvas.clientWidth / camera.zoom * .65 + 300, viewY = canvas.clientHeight / camera.zoom * .65 + 300;
    for (const f of foods) {
        if (Math.abs(f.x - camera.x) > viewX || Math.abs(f.y - camera.y) > viewY)
            continue;
        const pulse = 1 + Math.sin(now * .0042 + f.id * .53) * (f.kind ? .08 : .035);
        const r = (4.8 + Math.min(5.8, f.value * 1.24)) * pulse;
        const palette = foodPalette(f);
        if (effects && f.value >= 3) {
            ctx.fillStyle = withAlpha(palette.glow, .10);
            ctx.beginPath();
            ctx.arc(f.x, f.y, r * 2.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.beginPath();
        ctx.ellipse(f.x + r * .22, f.y + r * .72, r * .92, r * .46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(18,19,27,.74)";
        ctx.lineWidth = Math.max(1.4, r * .16);
        ctx.fillStyle = palette.base;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, r * .88, r * 1.02, -.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.inner;
        ctx.beginPath();
        ctx.ellipse(f.x + r * .10, f.y + r * .12, r * .48, r * .57, -.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.80)";
        ctx.beginPath();
        ctx.ellipse(f.x - r * .24, f.y - r * .3, Math.max(1.1, r * .22), Math.max(1.3, r * .29), -.45, 0, Math.PI * 2);
        ctx.fill();
    }
}
//# sourceMappingURL=foodRenderer.js.map