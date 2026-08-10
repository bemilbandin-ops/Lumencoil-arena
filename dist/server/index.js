import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CONFIG, SKINS } from "../shared/config.js";
import { GameWorld } from "./game.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 3001);
const HOST = String(process.env.HOST || "0.0.0.0");
const MAX_WS_PAYLOAD = 256 * 1024;
class WsPeer {
    id;
    socket;
    buffer = Buffer.alloc(0);
    fragmentOpcode = null;
    fragments = [];
    fragmentBytes = 0;
    lastSeen = Date.now();
    closed = false;
    joined = false;
    sessionToken = null;
    onMessage = () => { };
    onClose = () => { };
    constructor(id, socket) {
        this.id = id;
        this.socket = socket;
        socket.setNoDelay?.(true);
        socket.on("data", (chunk) => this.onData(chunk));
        socket.on("close", () => this.finishClose());
        socket.on("error", () => this.finishClose());
    }
    send(obj) {
        if (this.closed || this.socket.destroyed)
            return;
        this.sendFrame(0x1, Buffer.from(JSON.stringify(obj)));
    }
    close(code = 1000, reason = "") {
        if (this.closed)
            return;
        const reasonBytes = Buffer.from(reason.slice(0, 120));
        const payload = Buffer.alloc(2 + reasonBytes.length);
        payload.writeUInt16BE(code, 0);
        reasonBytes.copy(payload, 2);
        try {
            this.sendFrame(0x8, payload);
        }
        catch { }
        this.closed = true;
        try {
            this.socket.end();
        }
        catch { }
        this.onClose();
    }
    onData(chunk) {
        if (this.closed)
            return;
        this.lastSeen = Date.now();
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 2 && !this.closed) {
            const b0 = this.buffer[0];
            const b1 = this.buffer[1];
            const fin = (b0 & 0x80) !== 0;
            const rsv = b0 & 0x70;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            if (rsv !== 0 || !masked)
                return this.close(1002, "Protocol error");
            let len = b1 & 0x7f;
            let offset = 2;
            if (len === 126) {
                if (this.buffer.length < 4)
                    return;
                len = this.buffer.readUInt16BE(2);
                offset = 4;
            }
            else if (len === 127) {
                if (this.buffer.length < 10)
                    return;
                const big = this.buffer.readBigUInt64BE(2);
                if (big > BigInt(MAX_WS_PAYLOAD))
                    return this.close(1009, "Message too large");
                len = Number(big);
                offset = 10;
            }
            const control = opcode >= 0x8;
            if (control && (!fin || len > 125))
                return this.close(1002, "Invalid control frame");
            if (len > MAX_WS_PAYLOAD)
                return this.close(1009, "Message too large");
            if (this.buffer.length < offset + 4 + len)
                return;
            const mask = this.buffer.subarray(offset, offset + 4);
            offset += 4;
            const payload = Buffer.from(this.buffer.subarray(offset, offset + len));
            this.buffer = this.buffer.subarray(offset + len);
            for (let i = 0; i < payload.length; i++)
                payload[i] ^= mask[i % 4];
            if (opcode === 0x8) {
                this.close(1000);
                return;
            }
            if (opcode === 0x9) {
                this.sendFrame(0xA, payload);
                continue;
            }
            if (opcode === 0xA)
                continue;
            if (opcode === 0x2) {
                this.close(1003, "Binary unsupported");
                return;
            }
            if (opcode === 0x1) {
                if (this.fragmentOpcode !== null) {
                    this.close(1002, "Unexpected text frame");
                    return;
                }
                if (fin)
                    this.consumeText(payload);
                else {
                    this.fragmentOpcode = opcode;
                    this.fragments = [payload];
                    this.fragmentBytes = payload.length;
                }
                continue;
            }
            if (opcode === 0x0) {
                if (this.fragmentOpcode !== 0x1) {
                    this.close(1002, "Unexpected continuation");
                    return;
                }
                this.fragments.push(payload);
                this.fragmentBytes += payload.length;
                if (this.fragmentBytes > MAX_WS_PAYLOAD) {
                    this.close(1009, "Message too large");
                    return;
                }
                if (fin) {
                    const full = Buffer.concat(this.fragments);
                    this.fragmentOpcode = null;
                    this.fragments = [];
                    this.fragmentBytes = 0;
                    this.consumeText(full);
                }
                continue;
            }
            this.close(1002, "Unknown opcode");
        }
    }
    consumeText(payload) {
        try {
            const parsed = JSON.parse(payload.toString("utf8"));
            if (parsed && typeof parsed.type === "string")
                this.onMessage(parsed);
        }
        catch {
            // Malformed JSON is intentionally ignored rather than crashing the room.
        }
    }
    sendFrame(opcode, payload) {
        if (this.socket.destroyed)
            return;
        let header;
        if (payload.length < 126) {
            header = Buffer.from([0x80 | opcode, payload.length]);
        }
        else if (payload.length < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x80 | opcode;
            header[1] = 126;
            header.writeUInt16BE(payload.length, 2);
        }
        else {
            header = Buffer.alloc(10);
            header[0] = 0x80 | opcode;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(payload.length), 2);
        }
        this.socket.write(Buffer.concat([header, payload]));
    }
    finishClose() {
        if (this.closed)
            return;
        this.closed = true;
        this.onClose();
    }
}
const peers = new Map();
const sessions = new Map();
const world = new GameWorld((connectionId, snakeId, stats) => {
    if (connectionId)
        peers.get(connectionId)?.send({ type: "death", stats });
    const session = findSessionBySnake(snakeId);
    if (session && !connectionId)
        session.expiresAt = Math.max(session.expiresAt ?? 0, Date.now() + CONFIG.RECONNECT_GRACE_MS);
});
let peerCounter = 1;
const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
};
function serveFile(res, file) {
    fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path.extname(file);
        res.writeHead(200, {
            "Content-Type": mime[ext] || "application/octet-stream",
            "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
            "X-Content-Type-Options": "nosniff"
        });
        fs.createReadStream(file).pipe(res);
    });
}
const requestHandler = (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok: true, sessions: sessions.size, peers: peers.size, ...world.debugCounts() }));
        return;
    }
    const base = url.pathname.startsWith("/dist/") ? ROOT : PUBLIC;
    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const file = path.resolve(base, rel);
    const normalizedBase = base.endsWith(path.sep) ? base : base + path.sep;
    if (file !== base && !file.startsWith(normalizedBase)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    if (fs.existsSync(file))
        serveFile(res, file);
    else
        serveFile(res, path.join(PUBLIC, "index.html"));
};
const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;
const server = tlsCert && tlsKey
    ? https.createServer({ cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) }, requestHandler)
    : http.createServer(requestHandler);
server.on("upgrade", (req, socket) => {
    if (req.url !== "/ws" || req.headers.upgrade?.toLowerCase() !== "websocket") {
        socket.destroy();
        return;
    }
    const key = req.headers["sec-websocket-key"];
    const version = req.headers["sec-websocket-version"];
    if (!key || version !== "13") {
        socket.destroy();
        return;
    }
    const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const peer = new WsPeer(`c${peerCounter++}`, socket);
    peers.set(peer.id, peer);
    peer.onMessage = msg => {
        if (!msg || typeof msg.type !== "string")
            return;
        if (msg.type === "join" && !peer.joined) {
            const nickname = sanitizeNickname(String(msg.nickname || "Player"));
            const skin = SKINS.some(s => s.id === msg.skin) ? msg.skin : "nova";
            const requestedToken = typeof msg.resumeToken === "string" ? msg.resumeToken : "";
            const session = requestedToken ? sessions.get(requestedToken) : undefined;
            if (session && !session.peerId && (!session.expiresAt || session.expiresAt > Date.now())) {
                const snake = world.reattachHuman(session.snakeId, peer.id);
                if (snake) {
                    session.peerId = peer.id;
                    session.expiresAt = undefined;
                    peer.joined = true;
                    peer.sessionToken = session.token;
                    peer.send({ type: "welcome", playerId: snake.id, arenaRadius: CONFIG.ARENA_RADIUS, resumeToken: session.token, resumed: true });
                    if (!snake.alive && snake.deathStats)
                        peer.send({ type: "death", stats: snake.deathStats });
                    return;
                }
                sessions.delete(session.token);
            }
            try {
                const snake = world.addHuman(peer.id, nickname, skin);
                const token = crypto.randomBytes(18).toString("base64url");
                sessions.set(token, { token, snakeId: snake.id, peerId: peer.id });
                peer.joined = true;
                peer.sessionToken = token;
                peer.send({ type: "welcome", playerId: snake.id, arenaRadius: CONFIG.ARENA_RADIUS, resumeToken: token, resumed: false });
            }
            catch {
                peer.send({ type: "error", message: "Arena is full. Reconnect shortly." });
                setTimeout(() => peer.close(1013, "Arena full"), 150);
            }
            return;
        }
        if (msg.type === "input" && peer.joined) {
            world.applyHumanInput(peer.id, Number(msg.seq), Number(msg.angle), Boolean(msg.boost), Date.now());
        }
        else if (msg.type === "respawn" && peer.joined) {
            world.respawnHuman(peer.id);
        }
        else if (msg.type === "leave" && peer.joined) {
            const token = peer.sessionToken;
            world.removeHuman(peer.id);
            peer.joined = false;
            if (token)
                sessions.delete(token);
            peer.sessionToken = null;
            peer.close(1000, "Left arena");
        }
        else if (msg.type === "pong") {
            peer.lastSeen = Date.now();
        }
    };
    peer.onClose = () => {
        peers.delete(peer.id);
        if (!peer.joined)
            return;
        const snake = world.detachHuman(peer.id);
        const token = peer.sessionToken;
        if (token) {
            const session = sessions.get(token);
            if (session) {
                session.peerId = undefined;
                session.expiresAt = Date.now() + CONFIG.RECONNECT_GRACE_MS;
            }
            else if (snake) {
                sessions.set(token, { token, snakeId: snake.id, expiresAt: Date.now() + CONFIG.RECONNECT_GRACE_MS });
            }
        }
    };
});
const tickMs = 1000 / CONFIG.SERVER_TICK_RATE;
let lastTick = performance.now();
setInterval(() => {
    const now = performance.now();
    const dt = Math.min(.1, (now - lastTick) / 1000);
    lastTick = now;
    world.tick(dt);
}, tickMs);
setInterval(() => {
    for (const [id, peer] of peers) {
        if (Date.now() - peer.lastSeen > CONFIG.CONNECTION_TIMEOUT_MS) {
            peer.close(1001, "Timed out");
            continue;
        }
        const snapshot = world.snapshotFor(id);
        if (snapshot)
            peer.send(snapshot);
    }
}, 1000 / CONFIG.SNAPSHOT_RATE);
setInterval(() => {
    const now = Date.now();
    for (const peer of peers.values())
        peer.send({ type: "ping", at: now });
    for (const [token, session] of sessions) {
        if (!session.peerId && session.expiresAt && session.expiresAt <= now) {
            world.expireHuman(session.snakeId);
            sessions.delete(token);
        }
    }
}, CONFIG.HEARTBEAT_INTERVAL_MS);
server.listen(PORT, HOST, () => {
    const scheme = tlsCert && tlsKey ? "https" : "http";
    console.log(`Lumencoil Arena ready at ${scheme}://localhost:${PORT}`);
    console.log("Initial population:", world.debugCounts());
});
function sanitizeNickname(value) {
    return value.replace(/[^\p{L}\p{N}_ .-]/gu, "").trim().slice(0, 18) || "Player";
}
function findSessionBySnake(snakeId) {
    for (const session of sessions.values())
        if (session.snakeId === snakeId)
            return session;
    return undefined;
}
//# sourceMappingURL=index.js.map