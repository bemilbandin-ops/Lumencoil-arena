import { CONFIG } from "../shared/config.js";
import type { MatchResult, MatchSnapshot } from "../shared/match.js";
import type { SnapshotMessage } from "../shared/types.js";
import { GameWorld, type Snake } from "./game.js";

let nextMatchId = 1;

export class MatchSession {
  world!: GameWorld;
  playerId = "";
  phase: MatchSnapshot["phase"] = "GROWTH";
  result: MatchResult = null;
  startedAt: number;
  private bossId: string | null = null;
  private lastRestartAt: number;
  private connectionId: string;
  private nickname: string;
  private skin: string;
  private readonly idPrefix: string;

  constructor(connectionId: string, nickname: string, skin: string, now = Date.now()) {
    this.connectionId = connectionId;
    this.nickname = nickname;
    this.skin = skin;
    this.idPrefix = `m${nextMatchId++}-`;
    this.startedAt = now;
    this.lastRestartAt = now - CONFIG.MATCH_RESTART_COOLDOWN_MS;
    this.createWorld(now);
  }

  tick(dt: number, now = Date.now()): void {
    if (this.result) return;
    const elapsed = now - this.startedAt;
    if (this.phase === "GROWTH" && elapsed >= CONFIG.MATCH_GROWTH_MS) {
      this.phase = "BOSS";
      this.world.setBotReplacementEnabled(false);
      this.bossId = this.world.createBoss().id;
    }
    this.world.tick(dt);
    if (!this.result && elapsed >= CONFIG.MATCH_GROWTH_MS + CONFIG.MATCH_BOSS_MS) this.finish("DEFEAT");
  }

  snapshotFor(connectionId: string, now = Date.now()): SnapshotMessage | null {
    const snapshot = this.world.snapshotFor(connectionId);
    if (!snapshot) return null;
    return { ...snapshot, match: this.matchSnapshot(now) };
  }

  applyInput(connectionId: string, seq: number, angle: number, boost: boolean, now: number): void {
    if (!this.result) this.world.applyHumanInput(connectionId, seq, angle, boost, now);
  }

  detach(connectionId: string): Snake | null {
    return this.world.detachHuman(connectionId);
  }

  reattach(connectionId: string): Snake | null {
    const snake = this.world.reattachHuman(this.playerId, connectionId);
    if (snake) this.connectionId = connectionId;
    return snake;
  }

  restart(connectionId = this.connectionId, nickname = this.nickname, skin = this.skin, now = Date.now()): Snake | null {
    if (now - this.lastRestartAt < CONFIG.MATCH_RESTART_COOLDOWN_MS) return null;
    this.connectionId = connectionId;
    this.nickname = nickname;
    this.skin = skin;
    this.lastRestartAt = now;
    return this.createWorld(now);
  }

  debugCounts(): { humans: number; bots: number; active: number; foods: number } {
    return this.world.debugCounts();
  }

  private createWorld(now: number): Snake {
    this.phase = "GROWTH";
    this.result = null;
    this.bossId = null;
    this.startedAt = now;
    this.world = new GameWorld(
      (_connectionId, snakeId) => {
        if (snakeId === this.playerId) this.finish("DEFEAT");
      },
      (snakeId, killerId) => {
        if (snakeId === this.bossId && killerId === this.playerId) this.finish("WIN");
      },
      this.idPrefix
    );
    const player = this.world.addHuman(this.connectionId, this.nickname, this.skin);
    this.playerId = player.id;
    return player;
  }

  private matchSnapshot(now: number): MatchSnapshot {
    const total = CONFIG.MATCH_GROWTH_MS + CONFIG.MATCH_BOSS_MS;
    const boss = this.bossId ? this.world.getSnake(this.bossId) : undefined;
    return {
      phase: this.phase,
      remainingMs: Math.max(0, total - (now - this.startedAt)),
      result: this.result,
      bossId: this.bossId,
      bossLevel: boss?.level ?? (this.phase === "BOSS" || this.result === "WIN" ? CONFIG.MATCH_BOSS_LEVEL : null)
    };
  }

  private finish(result: Exclude<MatchResult, null>): void {
    if (this.result) return;
    this.result = result;
    this.phase = "RESULT";
  }
}
