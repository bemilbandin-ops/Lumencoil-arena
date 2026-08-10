import { SKINS } from "../shared/config.js";
import { GameClient } from "./gameClient.js";
class App extends React.Component {
    canvas = null;
    game = null;
    state = {
        phase: "menu",
        nickname: localStorage.getItem("lumencoil.nickname") || randomName(),
        skin: localStorage.getItem("lumencoil.skin") || "nova",
        score: 0, mass: 0, rank: 0, kills: 0, survivalSeconds: 0,
        leaderboard: [], death: null,
        best: Number(localStorage.getItem("lumencoil.best") || 0),
        replaying: false,
        sound: localStorage.getItem("lumencoil.sound") !== "0",
        effects: localStorage.getItem("lumencoil.effects") !== "0"
    };
    componentWillUnmount() { this.game?.disconnect(true); }
    play = () => {
        const nickname = this.state.nickname.trim().slice(0, 18) || randomName();
        localStorage.setItem("lumencoil.nickname", nickname);
        localStorage.setItem("lumencoil.skin", this.state.skin);
        this.setState({ phase: "connecting", nickname, death: null, score: 0, mass: 0, kills: 0, survivalSeconds: 0, replaying: false });
        this.startGame(nickname);
    };
    startGame(nicknameOverride) {
        if (!this.canvas) {
            requestAnimationFrame(() => this.startGame(nicknameOverride));
            return;
        }
        this.game?.disconnect(true);
        this.game = new GameClient(this.canvas, nicknameOverride || this.state.nickname, this.state.skin, { sound: this.state.sound, effects: this.state.effects }, {
            onPhase: phase => this.setState({ phase: phase === "failed" ? "failed" : phase }),
            onStats: stats => this.setState({ ...stats }),
            onDeath: death => {
                const best = Math.max(this.state.best, death.score);
                localStorage.setItem("lumencoil.best", String(best));
                this.setState({ phase: "dead", death, best });
            },
            onReplay: replaying => this.setState({ replaying })
        });
    }
    mainMenu = () => {
        this.game?.disconnect(true);
        this.game = null;
        this.setState({ phase: "menu", death: null, leaderboard: [], score: 0, mass: 0, rank: 0, kills: 0, survivalSeconds: 0, replaying: false });
    };
    playAgain = () => {
        if (!this.game) {
            this.play();
            return;
        }
        this.setState({ phase: "playing", death: null, score: 0, mass: 0, rank: 0, kills: 0, survivalSeconds: 0, replaying: false });
        this.game.respawn();
    };
    setSound = (enabled) => {
        localStorage.setItem("lumencoil.sound", enabled ? "1" : "0");
        this.setState({ sound: enabled }, () => this.game?.setSettings({ sound: this.state.sound, effects: this.state.effects }));
    };
    setEffects = (enabled) => {
        localStorage.setItem("lumencoil.effects", enabled ? "1" : "0");
        this.setState({ effects: enabled }, () => this.game?.setSettings({ sound: this.state.sound, effects: this.state.effects }));
    };
    render() {
        const h = React.createElement;
        const active = this.state.phase !== "menu";
        return h("div", { className: "app" }, h("canvas", { className: `game-canvas ${active ? "visible" : ""}`, ref: (el) => { this.canvas = el; } }), this.state.phase === "menu" ? this.renderMenu() : null, active ? this.renderHud() : null, this.state.phase === "connecting" ? h("div", { className: "status-card" }, h("div", { className: "spinner" }), h("span", null, "ENTERING ARENA")) : null, this.state.phase === "reconnecting" ? h("div", { className: "status-card danger" }, h("div", { className: "spinner" }), h("span", null, "CONNECTION LOST / RECONNECTING")) : null, this.state.phase === "failed" ? h("div", { className: "status-card danger" }, h("span", null, "CONNECTION FAILED"), h("button", { onClick: this.mainMenu }, "MAIN MENU")) : null, this.state.phase === "dead" && !this.state.replaying ? this.renderDeath() : null, this.state.replaying ? h("div", { className: "replay-badge" }, h("span", null, "INSTANT REPLAY"), h("small", null, "LAST MOMENTS")) : null, active ? h("button", {
            className: "boost-button", "aria-label": "Boost",
            onPointerDown: (e) => { e.preventDefault(); this.game?.setBoost(true); },
            onPointerUp: (e) => { e.preventDefault(); this.game?.setBoost(false); },
            onPointerCancel: () => this.game?.setBoost(false)
        }, h("span", null, "BOOST"), h("small", null, "HOLD")) : null);
    }
    renderMenu() {
        const h = React.createElement;
        return h("main", { className: "menu-shell" }, h("div", { className: "menu-glow glow-a" }), h("div", { className: "menu-glow glow-b" }), h("section", { className: "menu-card" }, h("div", { className: "brand" }, h("div", { className: "brand-mark" }, h("i"), h("i"), h("i")), h("h1", null, "LUMENCOIL")), h("p", { className: "tagline" }, "Grow bright. Cut close. Stay alive."), h("label", { className: "field-label" }, "NICKNAME", h("input", {
            value: this.state.nickname, maxLength: 18, autoComplete: "off", spellCheck: false,
            onChange: (e) => this.setState({ nickname: e.target.value }),
            onKeyDown: (e) => { if (e.key === "Enter")
                this.play(); }
        })), h("div", { className: "skin-label" }, "COIL SKIN"), h("div", { className: "skins" }, ...SKINS.map(s => h("button", {
            key: s.id,
            className: `skin ${this.state.skin === s.id ? "selected" : ""}`,
            title: s.name,
            "aria-label": s.name,
            onClick: () => this.setState({ skin: s.id })
        }, h("span", { style: { background: `linear-gradient(135deg, ${s.body}, ${s.secondary})`, boxShadow: `0 0 18px ${s.glow}` } })))), h("button", { className: "play", onClick: this.play }, h("span", null, "PLAY"), h("small", null, "ENTER THE LIVE ARENA")), h("div", { className: "menu-meta" }, h("div", { className: "best" }, h("span", null, "BEST"), h("strong", null, this.state.best.toLocaleString())), h("div", { className: "toggles" }, toggleButton(h, "SOUND", this.state.sound, () => this.setSound(!this.state.sound)), toggleButton(h, "FX", this.state.effects, () => this.setEffects(!this.state.effects)))), h("div", { className: "controls" }, h("span", null, h("b", null, "STEER"), "Mouse or drag"), h("span", null, h("b", null, "BOOST"), "Click, Space, or button"))), h("div", { className: "menu-orbit orbit-a" }), h("div", { className: "menu-orbit orbit-b" }), h("div", { className: "menu-orbit orbit-c" }));
    }
    renderHud() {
        const h = React.createElement;
        return h("div", { className: "hud-layer" }, h("div", { className: "score-hud" }, stat(h, "SCORE", Math.round(this.state.score).toLocaleString(), true), stat(h, "RANK", this.state.rank ? `#${this.state.rank}` : "–", false), stat(h, "MASS", this.state.mass ? this.state.mass.toFixed(1) : "–", false), stat(h, "KILLS", String(this.state.kills), false), stat(h, "TIME", formatTime(this.state.survivalSeconds), false)), h("aside", { className: "leaderboard" }, h("div", { className: "leader-title" }, h("h2", null, "TOP COILS"), h("span", null, "LIVE")), ...this.state.leaderboard.slice(0, 10).map((e, i) => h("div", { key: e.id, className: "leader-row" }, h("span", { className: `place place-${i + 1}` }, i + 1), h("span", { className: "leader-name" }, e.nickname), h("span", { className: "leader-score" }, e.score.toLocaleString())))));
    }
    renderDeath() {
        const h = React.createElement;
        const d = this.state.death;
        if (!d)
            return null;
        return h("div", { className: "death-wrap" }, h("div", { className: "death-card" }, h("div", { className: "death-kicker" }, "RUN ENDED"), h("h2", null, "COIL BROKEN"), h("div", { className: "death-score-label" }, "FINAL SCORE"), h("div", { className: "death-score" }, d.score.toLocaleString()), h("div", { className: "death-stats" }, deathStat(h, "MASS", d.mass.toFixed(1)), deathStat(h, "SURVIVED", formatTime(d.survivalSeconds)), deathStat(h, "KILLS", String(d.kills))), h("button", { className: "play", onClick: this.playAgain }, h("span", null, "PLAY AGAIN"), h("small", null, "RESPAWN NOW")), h("button", { className: "secondary", onClick: this.mainMenu }, "MAIN MENU")));
    }
}
function randomName() {
    const a = ["Neon", "Tiny", "Wild", "Swift", "Soft", "Odd", "Blue", "Solar", "Mint", "Lucky", "Nova", "Prism"];
    const b = ["Moth", "Comet", "Otter", "Raven", "Bean", "Fox", "Orbit", "Mango", "Quark", "Noodle", "Lynx", "Wisp"];
    return `${a[Math.floor(Math.random() * a.length)]}${b[Math.floor(Math.random() * b.length)]}${Math.floor(Math.random() * 90 + 10)}`;
}
function formatTime(seconds) { const m = Math.floor(seconds / 60), s = Math.max(0, seconds % 60); return `${m}:${String(s).padStart(2, "0")}`; }
function stat(h, label, value, primary) { return h("div", { className: primary ? "primary-stat" : "" }, h("span", null, label), h("strong", null, value)); }
function deathStat(h, label, value) { return h("div", null, h("span", null, label), h("strong", null, value)); }
function toggleButton(h, label, enabled, click) {
    return h("button", { className: `toggle ${enabled ? "on" : ""}`, onClick: click, "aria-pressed": enabled }, h("span", null, label), h("i"));
}
ReactDOM.render(React.createElement(App), document.getElementById("root"));
//# sourceMappingURL=app.js.map