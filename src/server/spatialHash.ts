import type { Vec2 } from "../shared/types.js";

export class SpatialHash<T extends Vec2> {
  private readonly cells = new Map<string, T[]>();
  constructor(readonly cellSize: number) {}

  clear(): void { this.cells.clear(); }

  insert(item: T): void {
    const key = this.key(item.x, item.y);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
  }

  query(x: number, y: number, radius: number): T[] {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const out: T[] = [];
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const bucket = this.cells.get(`${gx},${gy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }
}
