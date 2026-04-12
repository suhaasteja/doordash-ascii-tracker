export class Framebuffer {
  width: number;
  height: number;
  buffer: string[][];
  frontColor: number[][]; // [r, g, b] compressed to 24-bit int or just an array
  
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = [];
    this.frontColor = [];
    this.clear();
  }

  clear() {
    this.buffer = Array.from({ length: this.height }, () => Array(this.width).fill(' '));
    this.frontColor = Array.from({ length: this.height }, () => Array(this.width).fill(0));
  }

  setChar(x: number, y: number, char: string, color: number) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.buffer[y][x] = char;
      this.frontColor[y][x] = color;
    }
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, char: string, color: number) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.setChar(x0, y0, char, color);
      if (x0 === x1 && y0 === y1) break;
      let e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  drawPolyOutline(points: [number, number][], char: string, color: number) {
    for (let i = 0; i < points.length - 1; i++) {
        this.drawLine(Math.floor(points[i][0]), Math.floor(points[i][1]), Math.floor(points[i+1][0]), Math.floor(points[i+1][1]), char, color);
    }
  }

  drawPolygonFilled(rings: [number, number][][], char: string, color: number) {
    if (!rings || rings.length === 0) return;
    
    // Very simple even-odd scanline fill
    const validRings = rings.filter(r => r.length >= 3);
    if (validRings.length === 0) return;

    let minY = Infinity, maxY = -Infinity;
    for (const ring of validRings) {
      for (const [x, y] of ring) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    
    minY = Math.max(0, Math.min(this.height - 1, Math.floor(minY)));
    maxY = Math.max(0, Math.min(this.height - 1, Math.floor(maxY)));

    for (let y = minY; y <= maxY; y++) {
      let nodes: number[] = [];
      for (const ring of validRings) {
        let j = ring.length - 1;
        for (let i = 0; i < ring.length; i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
            const x = xi + ((y - yi) / (yj - yi)) * (xj - xi);
            nodes.push(Math.floor(x));
          }
          j = i;
        }
      }
      nodes.sort((a, b) => a - b);
      for (let i = 0; i < nodes.length; i += 2) {
        if (i + 1 >= nodes.length) break;
        let xStart = Math.max(0, nodes[i]);
        let xEnd = Math.min(this.width - 1, nodes[i + 1]);
        for (let x = xStart; x <= xEnd; x++) {
          this.setChar(x, y, char, color);
        }
      }
    }
  }

  renderToScreen(): string {
    let out = '';
    let lastColor = -1;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const color = this.frontColor[y][x];
        const char = this.buffer[y][x];
        
        if (color !== lastColor) {
          if (color === 0) {
            out += '\x1b[0m';
          } else {
            const r = (color >> 16) & 0xff;
            const g = (color >> 8) & 0xff;
            const b = color & 0xff;
            out += `\x1b[38;2;${r};${g};${b}m`;
          }
          lastColor = color;
        }
        out += char;
      }
      out += '\x1b[0m\n';
      lastColor = 0;
    }
    return out;
  }
}
