export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
export function distanceSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
export function normalizeAngle(a) {
    while (a > Math.PI)
        a -= Math.PI * 2;
    while (a < -Math.PI)
        a += Math.PI * 2;
    return a;
}
export function angleDelta(from, to) {
    return normalizeAngle(to - from);
}
//# sourceMappingURL=types.js.map