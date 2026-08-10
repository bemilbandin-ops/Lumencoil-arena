export class GameAudio {
    ctx = null;
    enabled;
    boostHum = null;
    boostGain = null;
    constructor(enabled) {
        this.enabled = enabled;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled)
            this.stopBoost();
    }
    unlock() {
        if (!this.enabled)
            return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx)
            return;
        if (!this.ctx)
            this.ctx = new Ctx();
        if (this.ctx.state === "suspended")
            void this.ctx.resume();
    }
    pickup(value) {
        if (!this.enabled)
            return;
        const ctx = this.ensure();
        if (!ctx)
            return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(430 + Math.min(420, value * 58), t);
        osc.frequency.exponentialRampToValueAtTime(720 + Math.min(360, value * 35), t + 0.08);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.04, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
    }
    death() {
        if (!this.enabled)
            return;
        const ctx = this.ensure();
        if (!ctx)
            return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(185, t);
        osc.frequency.exponentialRampToValueAtTime(52, t + 0.42);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.48);
    }
    spawn() {
        if (!this.enabled)
            return;
        const ctx = this.ensure();
        if (!ctx)
            return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(540, t + 0.2);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.045, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.23);
    }
    setBoost(active) {
        if (!this.enabled || !active) {
            this.stopBoost();
            return;
        }
        if (this.boostHum)
            return;
        const ctx = this.ensure();
        if (!ctx)
            return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = 92;
        gain.gain.value = 0.012;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        this.boostHum = osc;
        this.boostGain = gain;
    }
    stopBoost() {
        if (!this.boostHum)
            return;
        try {
            this.boostHum.stop();
        }
        catch { }
        this.boostHum.disconnect();
        this.boostGain?.disconnect();
        this.boostHum = null;
        this.boostGain = null;
    }
    ensure() {
        this.unlock();
        return this.ctx?.state === "running" ? this.ctx : null;
    }
}
//# sourceMappingURL=audio.js.map