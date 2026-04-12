import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CACHE_DIR = path.join(os.homedir(), '.asciimaps', 'cache');

export class TileManager {
  private cache = new Map<string, VectorTile>();

  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  async fetchTile(z: number, x: number, y: number): Promise<VectorTile | null> {
    const key = `${z}_${x}_${y}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const cacheFile = path.join(CACHE_DIR, String(z), String(x), `${y}.pbf`);
    let buffer: Buffer;

    if (fs.existsSync(cacheFile)) {
      buffer = fs.readFileSync(cacheFile);
    } else {
        const url = `https://tiles.openfreemap.org/planet/latest/${z}/${x}/${y}.pbf`;
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'ascii-map-cli/1.0.0 (https://github.com/luthi/ascii-map)'
                }
            });
            if (!res.ok) return null;
            const arrayBuffer = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            
            fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
            fs.writeFileSync(cacheFile, buffer);
        } catch (e) {
            return null;
        }
    }

    try {
      const tile = new VectorTile(new Protobuf(buffer));
      this.cache.set(key, tile);
      if (this.cache.size > 512) {
        const firstKey = this.cache.keys().next().value;
        if(firstKey) this.cache.delete(firstKey);
      }
      return tile;
    } catch {
      return null;
    }
  }
}
