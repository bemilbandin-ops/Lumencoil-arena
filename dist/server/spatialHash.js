export class SpatialHash {
    cellSize;
    cells = new Map();
    constructor(cellSize) {
        this.cellSize = cellSize;
    }
    clear() { this.cells.clear(); }
    insert(item) {
        const key = this.key(item.x, item.y);
        const bucket = this.cells.get(key);
        if (bucket)
            bucket.push(item);
        else
            this.cells.set(key, [item]);
    }
    query(x, y, radius) {
        const minX = Math.floor((x - radius) / this.cellSize);
        const maxX = Math.floor((x + radius) / this.cellSize);
        const minY = Math.floor((y - radius) / this.cellSize);
        const maxY = Math.floor((y + radius) / this.cellSize);
        const out = [];
        for (let gx = minX; gx <= maxX; gx++) {
            for (let gy = minY; gy <= maxY; gy++) {
                const bucket = this.cells.get(`${gx},${gy}`);
                if (bucket)
                    out.push(...bucket);
            }
        }
        return out;
    }
    key(x, y) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
    }
}
//# sourceMappingURL=spatialHash.js.map