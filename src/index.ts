import * as readline from 'readline';
import { Command } from 'commander';
import { Framebuffer } from './render';
import { TileManager } from './tiles';
import { MIN_ZOOM, MAX_ZOOM, latLonToWorldPixel, worldPixelToLatLon, TILE_SIZE } from './math';

const COLORS = {
  water: 0x0055aa,
  green: 0x116622,
  building: 0x444444,
  road: 0xeeeeee,
  highway: 0xffaa00,
  waterway: 0x00aaff,
  text: 0xffffff
};

async function main() {
  const program = new Command();
  program
    .name('ascii-map')
    .description('Terminal-based ASCII map explorer')
    .option('--lat <number>', 'starting latitude', '43.6446')
    .option('--lon <number>', 'starting longitude', '-79.3849')
    .option('--zoom <number>', 'starting zoom level (0-14)', '13')
    .parse(process.argv);

  const options = program.opts();

  const tileManager = new TileManager();
  
  let lat = parseFloat(options.lat);
  let lon = parseFloat(options.lon);
  let zoom = parseInt(options.zoom, 10);
  let cellAspect = 0.5;

  let width = process.stdout.columns || 80;
  let height = (process.stdout.rows || 24) - 2;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  async function render() {
    width = process.stdout.columns || 80;
    height = (process.stdout.rows || 24) - 2;
    if (width < 20 || height < 10) return;

    const [wx, wy] = latLonToWorldPixel(lat, lon, zoom);
    
    const viewWorldW = width * cellAspect;
    const viewWorldH = height * 1.0;
    const tlWorldX = wx - viewWorldW / 2;
    const tlWorldY = wy - viewWorldH / 2;

    const minTx = Math.floor(tlWorldX / TILE_SIZE);
    const maxTx = Math.floor((tlWorldX + viewWorldW) / TILE_SIZE);
    const minTy = Math.floor(tlWorldY / TILE_SIZE);
    const maxTy = Math.floor((tlWorldY + viewWorldH) / TILE_SIZE);

    const worldTiles = Math.pow(2, zoom);

    const fb = new Framebuffer(width, height);

    const promises: Promise<any>[] = [];
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        if (ty < 0 || ty >= worldTiles) continue;
        let wrappedTx = ((tx % worldTiles) + worldTiles) % worldTiles;
        
        promises.push(tileManager.fetchTile(zoom, wrappedTx, ty).then(tile => {
            if (!tile) return;
            const extent = 4096; // Mapbox vectors are typically 4096, but we check feature extent if needed
            
            function project(pt: {x: number, y: number}, layerExtent: number) {
                const worldX = (tx + pt.x / layerExtent) * TILE_SIZE;
                const worldY = (ty + pt.y / layerExtent) * TILE_SIZE;
                return [
                    (worldX - tlWorldX) / cellAspect,
                    (worldY - tlWorldY) / 1.0
                ] as [number, number];
            }

            // Polygons
            for (const layerName of ['landuse', 'landcover', 'water', 'building']) {
              const layer = tile.layers[layerName];
              if (!layer) continue;
              const char = layerName === 'water' ? '~' : layerName === 'building' ? '#' : "'";
              const color = layerName === 'water' ? COLORS.water : layerName === 'building' ? COLORS.building : COLORS.green;
              
              for (let i = 0; i < layer.length; i++) {
                const feat = layer.feature(i);
                if (feat.type === 3) { // Polygon
                  const geom = feat.loadGeometry();
                  const rings = geom.map(ring => ring.map(pt => project(pt, feat.extent)));
                  fb.drawPolygonFilled(rings, char, color);
                }
              }
            }

            // Lines
            for (const layerName of ['road', 'transportation', 'waterway']) {
                const layer = tile.layers[layerName];
                if (!layer) continue;
                
                for (let i = 0; i < layer.length; i++) {
                  const feat = layer.feature(i);
                  let isHighway = false;
                  if (feat.properties.class === 'motorway' || feat.properties.class === 'trunk') isHighway = true;
                  
                  const char = layerName === 'waterway' ? '|' : (isHighway ? '=' : '.');
                  const color = layerName === 'waterway' ? COLORS.waterway : (isHighway ? COLORS.highway : COLORS.road);

                  if (feat.type === 2) { // LineString
                    const geom = feat.loadGeometry();
                    for (const ring of geom) {
                       const points = ring.map(pt => project(pt, feat.extent));
                       fb.drawPolyOutline(points, char, color);
                    }
                  }
                }
            }
        }));
      }
    }

    await Promise.all(promises);

    // Render logic
    console.clear();
    const mapStr = fb.renderToScreen();
    process.stdout.write(mapStr);
    
    // Status line
    process.stdout.write(`\x1b[38;2;255;255;255m`);
    process.stdout.write(` lat: ${lat.toFixed(5)} lon: ${lon.toFixed(5)} zoom: ${zoom} | WASD/Arrows to pan, +/- to zoom, Q to quit `);
    process.stdout.write(`\x1b[0m`);
  }

  render();

  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.exit();
    }

    const step = 0.1 * Math.pow(2, 14 - zoom);
    
    if (key.name === 'w' || key.name === 'up') lat += step;
    if (key.name === 's' || key.name === 'down') lat -= step;
    if (key.name === 'a' || key.name === 'left') lon -= step;
    if (key.name === 'd' || key.name === 'right') lon += step;
    
    if (str === '+' || str === '=') zoom = Math.min(zoom + 1, MAX_ZOOM);
    if (str === '-' || str === '_') zoom = Math.max(zoom - 1, MIN_ZOOM);

    render();
  });
}

main().catch(console.error);
