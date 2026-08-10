export class GameAudio {
  private ctx: AudioContext | null = null;
  private enabled: boolean;
  private boostHum: OscillatorNode | null = null;
  private boostGain: GainNode | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopBoost();
  }

  unlock(): void {
    if (!this.enabled) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  pickup(value: number): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
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
    osc.start(t); osc.stop(t + 0.12);
  }

  death(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(185, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.42);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.48);
  }

  spawn(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
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
    osc.start(t); osc.stop(t + 0.23);
  }

  setBoost(active: boolean): void {
    if (!this.enabled || !active) { this.stopBoost(); return; }
    if (this.boostHum) return;
    const ctx = this.ensure();
    if (!ctx) return;
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

  private stopBoost(): void {
    if (!this.boostHum) return;
    try { this.boostHum.stop(); } catch {}
    this.boostHum.disconnect();
    this.boostGain?.disconnect();
    this.boostHum = null;
    this.boostGain = null;
  }

  private ensure(): AudioContext | null {
    this.unlock();
    return this.ctx?.state === "running" ? this.ctx : null;
  }
}
