import { CONFIG } from "../shared/config.js";
import { GameWorld } from "./game.js";
let nextMatchId = 1;
export class MatchSession {
    world;
    playerId = "";
    phase = "GROWTH";
    result = null;
    startedAt;
    bossId = null;
    lastRestartAt;
    connectionId;
    nickname;
    skin;
    idPrefix;
    constructor(connectionId, nickname, skin, now = Date.now()) {
        this.connectionId = connectionId;
        this.nickname = nickname;
        this.skin = skin;
        this.idPrefix = `m${nextMatchId++}-`;
        this.startedAt = now;
        this.lastRestartAt = now - CONFIG.MATCH_RESTART_COOLDOWN_MS;
        this.createWorld(now);
    }
    tick(dt, now = Date.now()) {
        if (this.result)
            return;
        const elapsed = now - this.startedAt;
        if (this.phase === "GROWTH" && elapsed >= CONFIG.MATCH_GROWTH_MS) {
            this.phase = "BOSS";
            this.world.setBotReplacementEnabled(false);
            this.bossId = this.world.createBoss().id;
        }
        this.world.tick(dt);
        if (!this.result && elapsed >= CONFIG.MATCH_GROWTH_MS + CONFIG.MATCH_BOSS_MS)
            this.finish("DEFEAT");
    }
    snapshotFor(connectionId, now = Date.now()) {
        const snapshot = this.world.snapshotFor(connectionId);
        if (!snapshot)
            return null;
        return { ...snapshot, match: this.matchSnapshot(now) };
    }
    applyInput(connectionId, seq, angle, boost, now) {
        if (!this.result)
            this.world.applyHumanInput(connectionId, seq, angle, boost, now);
    }
    detach(connectionId) {
        return this.world.detachHuman(connectionId);
    }
    reattach(connectionId) {
        const snake = this.world.reattachHuman(this.playerId, connectionId);
        if (snake)
            this.connectionId = connectionId;
        return snake;
    }
    restart(connectionId = this.connectionId, nickname = this.nickname, skin = this.skin, now = Date.now()) {
        if (now - this.lastRestartAt < CONFIG.MATCH_RESTART_COOLDOWN_MS)
            return null;
        this.connectionId = connectionId;
        this.nickname = nickname;
        this.skin = skin;
        this.lastRestartAt = now;
        return this.createWorld(now);
    }
    debugCounts() {
        return this.world.debugCounts();
    }
    createWorld(now) {
        this.phase = "GROWTH";
        this.result = null;
        this.bossId = null;
        this.startedAt = now;
        this.world = new GameWorld((_connectionId, snakeId) => {
            if (snakeId === this.playerId)
                this.finish("DEFEAT");
        }, (snakeId, killerId) => {
            if (snakeId === this.bossId && killerId === this.playerId)
                this.finish("WIN");
        }, this.idPrefix);
        const player = this.world.addHuman(this.connectionId, this.nickname, this.skin);
        this.playerId = player.id;
        return player;
    }
    matchSnapshot(now) {
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
    finish(result) {
        if (this.result)
            return;
        this.result = result;
        this.phase = "RESULT";
    }
}
//# sourceMappingURL=matchSession.js.map