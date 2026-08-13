import { SKINS } from "../shared/config.js";
import type { MatchSnapshot } from "../shared/match.js";
import type { DeathStats } from "../shared/types.js";
import { GameClient } from "./gameClient.js";

declare const React: any;
declare const ReactDOM: any;

type Phase = "menu" | "connecting" | "playing" | "reconnecting" | "result" | "failed";
type State = {
  phase: Phase;
  nickname: string;
  skin: string;
  score: number;
  mass: number;
  rank: number;
  kills: number;
  survivalSeconds: number;
  level: number;
  match: MatchSnapshot;
  death: DeathStats | null;
  best: number;
  replaying: boolean;
  sound: boolean;
  effects: boolean;
};

class App extends React.Component<{}, State> {
  private canvas: HTMLCanvasElement | null = null;
  private game: GameClient | null = null;

  state: State = {
    phase: "menu",
    nickname: localStorage.getItem("lumencoil.nickname") || randomName(),
    skin: localStorage.getItem("lumencoil.skin") || "nova",
    score: 0, mass: 0, rank: 0, kills: 0, survivalSeconds: 0, level: 1,
    match: freshMatch(), death: null,
    best: Number(localStorage.getItem("lumencoil.bestLevel") || 0),
    replaying: false,
    sound: localStorage.getItem("lumencoil.sound") !== "0",
    effects: localStorage.getItem("lumencoil.effects") !== "0"
  };

  componentWillUnmount(): void { this.game?.disconnect(true); }

  private play = (): void => {
    const nickname = this.state.nickname.trim().slice(0, 18) || randomName();
    localStorage.setItem("lumencoil.nickname", nickname);
    localStorage.setItem("lumencoil.skin", this.state.skin);
    this.setState({ phase: "connecting", nickname, death: null, score: 0, mass: 0, kills: 0, survivalSeconds: 0, level: 1, match: freshMatch(), replaying: false });
    this.startGame(nickname);
  };

  private startGame(nicknameOverride?: string): void {
    if (!this.canvas) { requestAnimationFrame(() => this.startGame(nicknameOverride)); return; }
    this.game?.disconnect(true);
    this.game = new GameClient(this.canvas, nicknameOverride || this.state.nickname, this.state.skin, { sound: this.state.sound, effects: this.state.effects }, {
      onPhase: phase => this.setState({ phase: phase === "failed" ? "failed" : phase }),
      onStats: stats => {
        const best = stats.match.result ? Math.max(this.state.best, stats.level) : this.state.best;
        if (best !== this.state.best) localStorage.setItem("lumencoil.bestLevel", String(best));
        this.setState({ ...stats, best, phase: stats.match.result ? "result" : "playing" });
      },
      onDeath: death => {
        const best = Math.max(this.state.best, death.level);
        localStorage.setItem("lumencoil.bestLevel", String(best));
        this.setState({ phase: "result", death, best, match: { ...this.state.match, phase: "RESULT", result: "DEFEAT" } });
      },
      onReplay: replaying => this.setState({ replaying })
    });
  }

  private mainMenu = (): void => {
    this.game?.disconnect(true);
    this.game = null;
    this.setState({ phase: "menu", death: null, score: 0, mass: 0, rank: 0, kills: 0, survivalSeconds: 0, level: 1, match: freshMatch(), replaying: false });
  };

  private playAgain = (): void => {
    if (!this.game) { this.play(); return; }
    this.setState({ phase: "connecting", death: null, score: 0, mass: 0, rank: 0, kills: 0, survivalSeconds: 0, level: 1, match: freshMatch(), replaying: false });
    this.game.respawn();
  };

  private setSound = (enabled: boolean): void => {
    localStorage.setItem("lumencoil.sound", enabled ? "1" : "0");
    this.setState({ sound: enabled }, () => this.game?.setSettings({ sound: this.state.sound, effects: this.state.effects }));
  };

  private setEffects = (enabled: boolean): void => {
    localStorage.setItem("lumencoil.effects", enabled ? "1" : "0");
    this.setState({ effects: enabled }, () => this.game?.setSettings({ sound: this.state.sound, effects: this.state.effects }));
  };

  render(): any {
    const h = React.createElement;
    const active = this.state.phase !== "menu";
    return h("div", { className: "app" },
      h("canvas", { className: `game-canvas ${active ? "visible" : ""}`, ref: (el: HTMLCanvasElement) => { this.canvas = el; } }),
      this.state.phase === "menu" ? this.renderMenu() : null,
      active ? this.renderHud() : null,
      this.state.phase === "connecting" ? h("div", { className: "status-card" }, h("div", { className: "spinner" }), h("span", null, "ENTERING ARENA")) : null,
      this.state.phase === "reconnecting" ? h("div", { className: "status-card danger" }, h("div", { className: "spinner" }), h("span", null, "CONNECTION LOST / RECONNECTING")) : null,
      this.state.phase === "failed" ? h("div", { className: "status-card danger" }, h("span", null, "CONNECTION FAILED"), h("button", { onClick: this.mainMenu }, "MAIN MENU")) : null,
      this.state.phase === "result" && !this.state.replaying ? this.renderResult() : null,
      this.state.replaying ? h("div", { className: "replay-badge" }, h("span", null, "INSTANT REPLAY"), h("small", null, "LAST MOMENTS")) : null,
      this.state.phase === "playing" ? h("button", {
        className: "boost-button", "aria-label": "Boost",
        onPointerDown: (e: PointerEvent) => { e.preventDefault(); this.game?.setBoost(true); },
        onPointerUp: (e: PointerEvent) => { e.preventDefault(); this.game?.setBoost(false); },
        onPointerCancel: () => this.game?.setBoost(false)
      }, h("span", null, "BOOST"), h("small", null, "HOLD")) : null
    );
  }

  private renderMenu(): any {
    const h = React.createElement;
    return h("main", { className: "menu-shell" },
      h("div", { className: "menu-glow glow-a" }),
      h("div", { className: "menu-glow glow-b" }),
      h("section", { className: "menu-card" },
        h("div", { className: "brand" }, h("div", { className: "brand-mark" }, h("i"), h("i"), h("i")), h("h1", null, "LUMENCOIL")),
        h("p", { className: "tagline" }, "Eat. Level up. Beat the boss."),
        h("label", { className: "field-label" }, "NICKNAME",
          h("input", {
            value: this.state.nickname, maxLength: 18, autoComplete: "off", spellCheck: false,
            onChange: (e: any) => this.setState({ nickname: e.target.value }),
            onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter") this.play(); }
          })
        ),
        h("div", { className: "skin-label" }, "COIL SKIN"),
        h("div", { className: "skins" }, ...SKINS.map(s => h("button", {
          key: s.id,
          className: `skin ${this.state.skin === s.id ? "selected" : ""}`,
          title: s.name,
          "aria-label": s.name,
          onClick: () => this.setState({ skin: s.id })
        }, h("span", { style: { background: `linear-gradient(135deg, ${s.body}, ${s.secondary})`, boxShadow: `0 0 18px ${s.glow}` } })) )),
        h("button", { className: "play", onClick: this.play }, h("span", null, "PLAY"), h("small", null, "START 90-SECOND RUN")),
        h("div", { className: "menu-meta" },
          h("div", { className: "best" }, h("span", null, "BEST LEVEL"), h("strong", null, this.state.best.toLocaleString())),
          h("div", { className: "toggles" },
            toggleButton(h, "SOUND", this.state.sound, () => this.setSound(!this.state.sound)),
            toggleButton(h, "FX", this.state.effects, () => this.setEffects(!this.state.effects))
          )
        ),
        h("div", { className: "controls" },
          h("span", null, h("b", null, "STEER"), "Mouse or drag"),
          h("span", null, h("b", null, "BOOST"), "Click, Space, or button")
        )
      ),
      h("div", { className: "menu-orbit orbit-a" }),
      h("div", { className: "menu-orbit orbit-b" }),
      h("div", { className: "menu-orbit orbit-c" })
    );
  }

  private renderHud(): any {
    const h = React.createElement;
    return h("div", { className: "hud-layer" },
      h("div", { className: "level-hud" }, h("span", null, "LEVEL"), h("strong", null, this.state.level)),
      h("div", { className: "match-timer" },
        h("span", null, this.state.match.phase === "BOSS" ? "BOSS FIGHT" : "GROW"),
        h("strong", null, formatMilliseconds(this.state.match.remainingMs))
      ),
      this.state.match.phase === "BOSS" ? h("div", { className: "boss-status" }, `BOSS · LV ${this.state.match.bossLevel ?? 80}`) : null,
      h("div", { className: "kill-hud" }, h("span", null, "KILLS"), h("strong", null, this.state.kills))
    );
  }

  private renderResult(): any {
    const h = React.createElement;
    const won = this.state.match.result === "WIN";
    return h("div", { className: "death-wrap" },
      h("div", { className: `death-card result-card ${won ? "win" : "defeat"}` },
        h("div", { className: "death-kicker" }, won ? "BOSS DEFEATED" : "RUN ENDED"),
        h("h2", null, won ? "VICTORY" : "DEFEAT"),
        h("div", { className: "death-score-label" }, "FINAL LEVEL"),
        h("div", { className: "death-score" }, this.state.level.toLocaleString()),
        h("div", { className: "death-stats" },
          deathStat(h, "KILLS", String(this.state.kills)),
          deathStat(h, "SCORE", Math.round(this.state.score).toLocaleString()),
          deathStat(h, "BEST LEVEL", String(this.state.best))
        ),
        h("button", { className: "play", onClick: this.playAgain }, h("span", null, "PLAY AGAIN"), h("small", null, "NEW 90-SECOND RUN")),
        h("button", { className: "secondary", onClick: this.mainMenu }, "MAIN MENU")
      )
    );
  }
}

function randomName(): string {
  const a = ["Neon", "Tiny", "Wild", "Swift", "Soft", "Odd", "Blue", "Solar", "Mint", "Lucky", "Nova", "Prism"];
  const b = ["Moth", "Comet", "Otter", "Raven", "Bean", "Fox", "Orbit", "Mango", "Quark", "Noodle", "Lynx", "Wisp"];
  return `${a[Math.floor(Math.random() * a.length)]}${b[Math.floor(Math.random() * b.length)]}${Math.floor(Math.random() * 90 + 10)}`;
}
function freshMatch(): MatchSnapshot { return { phase: "GROWTH", remainingMs: 90_000, result: null, bossId: null, bossLevel: null }; }
function formatMilliseconds(milliseconds: number): string { const total = Math.max(0, Math.ceil(milliseconds / 1000)), m = Math.floor(total / 60), s = total % 60; return `${m}:${String(s).padStart(2, "0")}`; }
function deathStat(h: any, label: string, value: string): any { return h("div", null, h("span", null, label), h("strong", null, value)); }
function toggleButton(h: any, label: string, enabled: boolean, click: () => void): any {
  return h("button", { className: `toggle ${enabled ? "on" : ""}`, onClick: click, "aria-pressed": enabled }, h("span", null, label), h("i"));
}

ReactDOM.render(React.createElement(App), document.getElementById("root"));
