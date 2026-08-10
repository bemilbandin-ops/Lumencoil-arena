export class InputController {
    state = { angle: 0, boost: false, joystickAnchor: null, joystickKnob: null };
    canvas;
    emit;
    touchPointerId = null;
    mouseBoost = false;
    externalBoost = false;
    disposed = false;
    constructor(canvas, emit) {
        this.canvas = canvas;
        this.emit = emit;
        this.bind();
    }
    setExternalBoost(active) {
        this.externalBoost = active;
        this.syncBoost(true);
    }
    dispose() {
        this.disposed = true;
        this.canvas.removeEventListener("contextmenu", this.onContextMenu);
        this.canvas.removeEventListener("pointermove", this.onPointerMove);
        this.canvas.removeEventListener("pointerdown", this.onPointerDown);
        this.canvas.removeEventListener("pointerup", this.onPointerUp);
        this.canvas.removeEventListener("pointercancel", this.onPointerUp);
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
    }
    bind() {
        this.canvas.addEventListener("contextmenu", this.onContextMenu);
        this.canvas.addEventListener("pointermove", this.onPointerMove, { passive: false });
        this.canvas.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        this.canvas.addEventListener("pointerup", this.onPointerUp, { passive: false });
        this.canvas.addEventListener("pointercancel", this.onPointerUp, { passive: false });
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
    }
    onContextMenu = (e) => { e.preventDefault(); };
    onPointerDown = (e) => {
        if (this.disposed)
            return;
        if (e.pointerType === "touch") {
            e.preventDefault();
            if (this.touchPointerId !== null)
                return;
            this.touchPointerId = e.pointerId;
            this.state.joystickAnchor = { x: e.clientX, y: e.clientY };
            this.state.joystickKnob = { x: e.clientX, y: e.clientY };
            try {
                this.canvas.setPointerCapture(e.pointerId);
            }
            catch { }
        }
        else if (e.button === 0) {
            this.mouseBoost = true;
            this.syncBoost(true);
        }
    };
    onPointerMove = (e) => {
        if (this.disposed)
            return;
        if (e.pointerType === "touch") {
            if (e.pointerId !== this.touchPointerId || !this.state.joystickAnchor)
                return;
            e.preventDefault();
            const a = this.state.joystickAnchor;
            const dx = e.clientX - a.x;
            const dy = e.clientY - a.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 8)
                this.state.angle = Math.atan2(dy, dx);
            const max = 52;
            const scale = distance > max ? max / Math.max(distance, 0.001) : 1;
            this.state.joystickKnob = { x: a.x + dx * scale, y: a.y + dy * scale };
            this.emit(this.state.angle, this.state.boost, false);
            return;
        }
        const r = this.canvas.getBoundingClientRect();
        this.state.angle = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
        this.emit(this.state.angle, this.state.boost, false);
    };
    onPointerUp = (e) => {
        if (e.pointerType === "touch" && e.pointerId === this.touchPointerId) {
            e.preventDefault();
            this.touchPointerId = null;
            this.state.joystickAnchor = null;
            this.state.joystickKnob = null;
        }
        else if (e.button === 0) {
            this.mouseBoost = false;
            this.syncBoost(true);
        }
    };
    onKeyDown = (e) => {
        if (e.code !== "Space")
            return;
        e.preventDefault();
        this.externalBoost = true;
        this.syncBoost(true);
    };
    onKeyUp = (e) => {
        if (e.code !== "Space")
            return;
        e.preventDefault();
        this.externalBoost = false;
        this.syncBoost(true);
    };
    syncBoost(force) {
        const boost = this.mouseBoost || this.externalBoost;
        if (boost === this.state.boost && !force)
            return;
        this.state.boost = boost;
        this.emit(this.state.angle, this.state.boost, force);
    }
}
//# sourceMappingURL=input.js.map