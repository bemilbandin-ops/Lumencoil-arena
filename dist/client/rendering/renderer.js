import { CONFIG } from "../../shared/config.js";
import { clamp } from "../../shared/types.js";
import { drawBackdrop, drawBoundaryWarning, drawMinimap, drawWorldBoundary } from "./arenaRenderer.js";
import { EffectsRenderer } from "./effectsRenderer.js";
import { drawFood } from "./foodRenderer.js";
import { interpolateSnakes } from "./renderMath.js";
import { drawSnake } from "./snakeRenderer.js";
export class GameRenderer {
    canvas;
    ctx;
    effects = new EffectsRenderer();
    arenaRadius = CONFIG.ARENA_RADIUS;
    playerId = "";
    camera = { x: 0, y: 0, zoom: 1 };
    dpr = 1;
    specks = [];
    lastCssWidth = 0;
    lastCssHeight = 0;
    constructor(canvas) {
        this.canvas = canvas;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx)
            throw new Error("Canvas 2D unavailable");
        this.ctx = ctx;
        for (let i = 0; i < 320; i++)
            this.specks.push({ x: Math.random(), y: Math.random(), size: Math.random() * 1.4 + .35, alpha: Math.random() * .11 + .025 });
        this.resize();
    }
    setArenaRadius(radius) { this.arenaRadius = radius; }
    setPlayerId(id) { this.playerId = id; }
    setEffects(enabled) { this.effects.setEnabled(enabled); }
    resize() {
        const r = this.canvas.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.round(r.width)), cssHeight = Math.max(1, Math.round(r.height));
        const nextDpr = Math.min(window.devicePixelRatio || 1, CONFIG.CANVAS_DPR_CAP);
        const physicalWidth = Math.max(1, Math.round(cssWidth * nextDpr)), physicalHeight = Math.max(1, Math.round(cssHeight * nextDpr));
        this.lastCssWidth = cssWidth;
        this.lastCssHeight = cssHeight;
        if (this.canvas.width === physicalWidth && this.canvas.height === physicalHeight && this.dpr === nextDpr)
            return;
        this.dpr = nextDpr;
        this.canvas.width = physicalWidth;
        this.canvas.height = physicalHeight;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = true;
    }
    handleEvent(event) { this.effects.handleEvent(event, this.playerId, this.camera); }
    render(pair, now, dt, input, replaying) {
        const width = this.canvas.clientWidth || this.lastCssWidth || 1, height = this.canvas.clientHeight || this.lastCssHeight || 1;
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = "#20242a";
        ctx.fillRect(0, 0, width, height);
        let me, snakes = [];
        if (pair) {
            snakes = interpolateSnakes(pair.prev.snakes, pair.next.snakes, pair.t);
            me = snakes.find(s => s.id === this.playerId);
            if (me?.body[0])
                this.updateCamera(me, dt, replaying);
        }
        const env = { canvas: this.canvas, ctx, camera: this.camera, arenaRadius: this.arenaRadius, effects: this.effects.enabled };
        drawBackdrop(env, width, height, now, this.specks);
        if (pair) {
            const shake = this.effects.getShakeOffset();
            ctx.save();
            ctx.translate(width / 2 + shake.x, height / 2 + shake.y);
            ctx.scale(this.camera.zoom, this.camera.zoom);
            ctx.translate(-this.camera.x, -this.camera.y);
            drawWorldBoundary(ctx, this.arenaRadius);
            drawFood(env, pair.next.foods, now);
            for (const snake of snakes) {
                const spawnT = this.effects.spawnTForSnake(snake.id, now);
                if (drawSnake(env, snake, snake.id === this.playerId, now, spawnT, me?.level ?? 1))
                    this.effects.emitBoostTrail(snake);
            }
            this.effects.updateAndDraw(ctx, dt);
            ctx.restore();
            drawBoundaryWarning(ctx, width, height, this.arenaRadius, me?.body[0]);
            drawMinimap(ctx, width, height, this.arenaRadius, me?.body[0]);
        }
        else
            this.effects.update(dt);
        if (input.joystickAnchor)
            this.drawJoystick(ctx, input.joystickAnchor, input.joystickKnob ?? input.joystickAnchor);
        this.effects.drawFrameOverlays(ctx, width, height, now, dt, replaying);
    }
    updateCamera(me, dt, replaying) {
        const head = me.body[0], desiredZoom = clamp(1.23 - (me.mass - CONFIG.START_MASS) * .00235, .62, 1.23);
        const smooth = 1 - Math.exp(-dt * (replaying ? 3.2 : CONFIG.LIVE_CAMERA_FOLLOW_RATE));
        if (Math.abs(this.camera.x) < .001 && Math.abs(this.camera.y) < .001) {
            this.camera.x = head.x;
            this.camera.y = head.y;
        }
        else {
            this.camera.x += (head.x - this.camera.x) * smooth;
            this.camera.y += (head.y - this.camera.y) * smooth;
        }
        this.camera.zoom += (desiredZoom - this.camera.zoom) * smooth;
    }
    drawJoystick(ctx, anchor, knob) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.035)";
        ctx.strokeStyle = "rgba(255,255,255,.58)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 54, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.14)";
        ctx.strokeStyle = "rgba(255,255,255,.82)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(knob.x, knob.y, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
//# sourceMappingURL=renderer.js.map