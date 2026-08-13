import { CONFIG } from "../../shared/config.js";
import { clamp } from "../../shared/types.js";
import { darken, skinFor, traceBody, withAlpha } from "./renderMath.js";
const FIRE_DRAGON = createSprites("/assets/snakes/fire-dragon");
function createSprites(base) {
    if (typeof Image === "undefined")
        return undefined;
    const load = (name) => {
        const image = new Image();
        image.src = `${base}/${name}.png`;
        return image;
    };
    return { head: load("head"), body: load("body"), tail: load("tail") };
}
function ready(sprites) {
    return !!sprites && Object.values(sprites).every(image => image.complete && image.naturalWidth > 0);
}
export function drawSnake(env, s, isMe, now, spawnT, playerLevel) {
    if (s.body.length < 2)
        return false;
    const { ctx, canvas, camera, effects } = env;
    const head = s.body[0];
    const viewX = canvas.clientWidth / camera.zoom * .73 + 640, viewY = canvas.clientHeight / camera.zoom * .73 + 640;
    if (!isMe && (Math.abs(head.x - camera.x) > viewX || Math.abs(head.y - camera.y) > viewY))
        return false;
    const palette = skinFor(s.skin);
    const sprites = s.skin === "ember" && ready(FIRE_DRAGON) ? FIRE_DRAGON : undefined;
    const radius = CONFIG.BODY_RADIUS + 2.15 + clamp((s.mass - CONFIG.START_MASS) * .016, 0, 6.2);
    ctx.save();
    const protectedPulse = s.protected ? .93 + Math.sin(now * .006) * .035 : 1;
    ctx.globalAlpha = (.38 + spawnT * .62) * protectedPulse;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.isBoss) {
        traceBody(ctx, s.body);
        ctx.strokeStyle = withAlpha("#ff4f9f", .28 + (Math.sin(now * .006) + 1) * .11);
        ctx.lineWidth = radius * 3.55;
        ctx.stroke();
    }
    if (!sprites) {
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
    }
    const step = s.body.length > 120 ? 3 : 2;
    if (sprites) {
        drawSpriteTail(ctx, s.body, radius, sprites.tail);
        for (let i = 2; i <= s.body.length - 2; i += step)
            drawSpriteBody(ctx, s.body, i, radius, sprites.body);
        drawSpriteHead(ctx, s, radius, spawnT, sprites.head);
    }
    else {
        for (let i = 2; i <= s.body.length - 2; i += step)
            drawBodySegment(ctx, s.body[i], i, radius, palette, now);
        drawHead(ctx, s, radius, palette, now, spawnT, effects);
    }
    drawLabel(ctx, s, radius, isMe, camera.zoom, playerLevel);
    ctx.restore();
    return true;
}
function drawSpriteBody(ctx, body, index, radius, image) {
    const p = body[index];
    const before = body[index - 1];
    const after = body[Math.min(index + 1, body.length - 1)];
    const angle = Math.atan2(before.y - after.y, before.x - after.x);
    const size = radius * 2.48;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    ctx.restore();
}
function drawSpriteTail(ctx, body, radius, image) {
    const tail = body[body.length - 1];
    const before = body[body.length - 2];
    const angle = Math.atan2(before.y - tail.y, before.x - tail.x);
    const width = radius * 4.25, height = radius * 2.65;
    ctx.save();
    ctx.translate(tail.x, tail.y);
    ctx.rotate(angle);
    ctx.drawImage(image, -width, -height / 2, width, height);
    ctx.restore();
}
function drawSpriteHead(ctx, s, radius, spawnT, image) {
    const head = s.body[0];
    const scale = .72 + spawnT * .28;
    const size = radius * 5.15 * scale;
    ctx.save();
    ctx.translate(head.x + Math.cos(s.angle) * radius * .35, head.y + Math.sin(s.angle) * radius * .35);
    ctx.rotate(s.angle);
    ctx.drawImage(image, -size * .46, -size / 2, size, size);
    ctx.restore();
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
function drawLabel(ctx, s, radius, isMe, zoom, playerLevel) {
    const head = s.body[0], invZoom = 1 / zoom;
    const nameSize = (isMe ? 17 : 12.5) * invZoom, levelSize = (isMe ? 11 : 8.5) * invZoom, y = head.y - radius * 2.05 - 10 * invZoom;
    const levelColor = s.isBoss ? "#ff7fbd" : isMe ? "#ffe574" : s.level < playerLevel ? "#7dffad" : s.level > playerLevel ? "#ff7182" : "rgba(235,239,244,.9)";
    const levelText = s.isBoss ? `BOSS · LV ${s.level}` : `LV ${s.level}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.font = `900 ${levelSize}px system-ui, sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,.88)";
    ctx.lineWidth = Math.max(2, 3.5 * invZoom);
    ctx.strokeText(levelText, head.x, y - nameSize * .92);
    ctx.fillStyle = levelColor;
    ctx.fillText(levelText, head.x, y - nameSize * .92);
    ctx.font = `950 ${nameSize}px system-ui, sans-serif`;
    ctx.strokeStyle = "rgba(0,0,0,.92)";
    ctx.lineWidth = Math.max(3, 5.5 * invZoom);
    ctx.strokeText(s.nickname, head.x, y);
    ctx.fillStyle = isMe ? "#fff" : "rgba(247,248,250,.95)";
    ctx.fillText(s.nickname, head.x, y);
}
//# sourceMappingURL=snakeRenderer.js.map