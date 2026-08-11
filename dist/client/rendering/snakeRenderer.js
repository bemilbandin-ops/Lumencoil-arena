import { CONFIG } from "../../shared/config.js";
import { clamp } from "../../shared/types.js";
import { darken, skinFor, traceBody, withAlpha } from "./renderMath.js";
export function drawSnake(env, s, isMe, now, spawnT) {
    if (s.body.length < 2)
        return false;
    const { ctx, canvas, camera, effects } = env;
    const head = s.body[0];
    const viewX = canvas.clientWidth / camera.zoom * .73 + 640, viewY = canvas.clientHeight / camera.zoom * .73 + 640;
    if (!isMe && (Math.abs(head.x - camera.x) > viewX || Math.abs(head.y - camera.y) > viewY))
        return false;
    const palette = skinFor(s.skin);
    const radius = CONFIG.BODY_RADIUS + 2.15 + clamp((s.mass - CONFIG.START_MASS) * .016, 0, 6.2);
    ctx.save();
    const protectedPulse = s.protected ? .93 + Math.sin(now * .006) * .035 : 1;
    ctx.globalAlpha = (.38 + spawnT * .62) * protectedPulse;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.save();
    ctx.translate(3.5, 5);
    traceBody(ctx, s.body);
    ctx.strokeStyle = "rgba(0,0,0,.28)";
    ctx.lineWidth = radius * 2.95;
    ctx.stroke();
    ctx.restore();
    traceBody(ctx, s.body);
    ctx.strokeStyle = "#101218";
    ctx.lineWidth = radius * 2.80;
    ctx.stroke();
    traceBody(ctx, s.body);
    ctx.strokeStyle = darken(palette.body, .34);
    ctx.lineWidth = radius * 2.46;
    ctx.stroke();
    traceBody(ctx, s.body);
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = radius * 2.08;
    ctx.stroke();
    const step = s.body.length > 120 ? 3 : 2;
    for (let i = s.body.length - 2; i >= 2; i -= step)
        drawBodySegment(ctx, s.body[i], i, radius, palette, now);
    drawHead(ctx, s, radius, palette, now, spawnT, effects);
    drawLabel(ctx, s, radius, isMe, camera.zoom);
    ctx.restore();
    return true;
}
function drawBodySegment(ctx, p, index, radius, palette, now) {
    const band = Math.floor(index / 4) % 2;
    const accentBand = palette.pattern === "stripe" ? band === 0 : palette.pattern === "dual" ? band === 1 : false;
    const rr = radius * (.94 + Math.sin(index * .83) * .018), bodyColor = accentBand ? palette.secondary : palette.body;
    ctx.fillStyle = "rgba(0,0,0,.30)";
    ctx.beginPath();
    ctx.arc(p.x + rr * .12, p.y + rr * .20, rr * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(10,11,16,.84)";
    ctx.lineWidth = Math.max(1.6, rr * .15);
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = withAlpha(palette.secondary, palette.pattern === "spark" ? .44 : .24);
    ctx.beginPath();
    ctx.arc(p.x + rr * .25, p.y + rr * .28, rr * .58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(p.x - rr * .28, p.y - rr * .32, rr * .30, rr * .17, -.55, 0, Math.PI * 2);
    ctx.fill();
    if (palette.pattern === "pulse") {
        const pulse = .35 + (Math.sin(now * .005 + index * .46) + 1) * .17;
        ctx.fillStyle = withAlpha(palette.accent, pulse);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * .22, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (palette.pattern === "spark" && index % 6 === 0) {
        ctx.fillStyle = withAlpha(palette.accent, .9);
        ctx.beginPath();
        ctx.arc(p.x - rr * .1, p.y - rr * .08, rr * .19, 0, Math.PI * 2);
        ctx.fill();
    }
}
function drawHead(ctx, s, radius, palette, now, spawnT, effects) {
    const head = s.body[0], angle = s.angle, scale = .72 + spawnT * .28;
    const headLength = radius * 1.62 * scale, headWidth = radius * 1.33 * scale;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);
    ctx.fillStyle = "#101218";
    for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-radius * .12, sign * headWidth * .72);
        ctx.lineTo(-radius * .78, sign * headWidth * 1.24);
        ctx.lineTo(radius * .26, sign * headWidth * .78);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = darken(palette.secondary, .2);
    for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-radius * .18, sign * headWidth * .67);
        ctx.lineTo(-radius * .66, sign * headWidth * 1.04);
        ctx.lineTo(radius * .14, sign * headWidth * .72);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,.30)";
    ctx.beginPath();
    ctx.ellipse(radius * .16, radius * .22, headLength * 1.05, headWidth * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f1117";
    ctx.lineWidth = Math.max(2, radius * .18);
    ctx.fillStyle = palette.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, headLength, headWidth, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = withAlpha(palette.secondary, .5);
    ctx.beginPath();
    ctx.ellipse(-radius * .18, radius * .25, headLength * .72, headWidth * .63, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.beginPath();
    ctx.ellipse(radius * .16, -radius * .36, headLength * .52, headWidth * .24, -.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(palette.accent, .68);
    ctx.beginPath();
    ctx.moveTo(radius * .98, 0);
    ctx.lineTo(radius * .23, -radius * .31);
    ctx.lineTo(-radius * .16, 0);
    ctx.lineTo(radius * .23, radius * .31);
    ctx.closePath();
    ctx.fill();
    for (const sign of [-1, 1]) {
        const ex = radius * .58, ey = sign * radius * .58;
        ctx.fillStyle = "#090a0f";
        ctx.beginPath();
        ctx.ellipse(ex, ey, radius * .35, radius * .28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f8fbff";
        ctx.beginPath();
        ctx.ellipse(ex + radius * .04, ey, radius * .24, radius * .19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#15171f";
        ctx.beginPath();
        ctx.arc(ex + radius * .14, ey, radius * .095, 0, Math.PI * 2);
        ctx.fill();
    }
    if (effects) {
        ctx.strokeStyle = withAlpha(palette.glow, .12 + Math.sin(now * .004) * .025);
        ctx.lineWidth = radius * .38;
        ctx.beginPath();
        ctx.ellipse(0, 0, headLength * 1.13, headWidth * 1.16, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}
function drawLabel(ctx, s, radius, isMe, zoom) {
    const head = s.body[0], invZoom = 1 / zoom;
    const level = Math.max(1, Math.floor((s.mass - CONFIG.START_MASS) * .85) + 1);
    const nameSize = (isMe ? 17 : 12.5) * invZoom, levelSize = (isMe ? 11 : 8.5) * invZoom, y = head.y - radius * 2.05 - 10 * invZoom;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.font = `900 ${levelSize}px system-ui, sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,.88)";
    ctx.lineWidth = Math.max(2, 3.5 * invZoom);
    ctx.strokeText(`Lv${level}`, head.x, y - nameSize * .92);
    ctx.fillStyle = isMe ? "#ffe574" : "rgba(235,239,244,.9)";
    ctx.fillText(`Lv${level}`, head.x, y - nameSize * .92);
    ctx.font = `950 ${nameSize}px system-ui, sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,.92)";
    ctx.lineWidth = Math.max(3, 5.5 * invZoom);
    ctx.strokeText(s.nickname, head.x, y);
    ctx.fillStyle = isMe ? "#fff" : "rgba(247,248,250,.95)";
    ctx.fillText(s.nickname, head.x, y);
}
//# sourceMappingURL=snakeRenderer.js.map