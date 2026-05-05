import * as readline from 'readline';
import * as fs from 'fs';
import { Command } from 'commander';
import { Framebuffer } from './render';
import { TileManager } from './tiles';
import { DoorDashTracker, TrackingState } from './doordash';
import { MIN_ZOOM, MAX_ZOOM, latLonToWorldPixel, worldPixelToLatLon, TILE_SIZE } from './math';

const COLORS = {
  water: 0x0055aa,
  green: 0x116622,
  building: 0x444444,
  road: 0xeeeeee,
  highway: 0xffaa00,
  waterway: 0x00aaff,
  text: 0xffffff,
  driver: 0x00ff44,
  destination: 0xff4444,
  status: 0xffff00,
};

async function main() {
  const program = new Command();
  program
    .name('ascii-map')
    .description('Terminal-based ASCII map explorer')
    .option('--lat <number>', 'starting latitude', '37.7750')
    .option('--lon <number>', 'starting longitude', '-122.4183')
    .option('--zoom <number>', 'starting zoom level (0-14)', '13')
    .option('--doordash <url>', 'DoorDash order tracking URL to follow live')
    .option('--cookies <file>', 'path to file containing raw Cookie header (for --doordash)')
    .option('--mock', 'use local mock server at localhost:3456 instead of real DoorDash')
    .parse(process.argv);

  const options = program.opts();

  const tileManager = new TileManager();

  let lat = parseFloat(options.lat);
  let lon = parseFloat(options.lon);
  let zoom = parseInt(options.zoom, 10);
  let cellAspect = 0.5;

  // DoorDash live tracking state
  let tracking: TrackingState | null = null;
  let trackingMode = false;
  let trackingError = '';
  let blink = false;
  const routeTrail: Array<{ lat: number; lon: number }> = [];
  const MAX_TRAIL = 120;

  let width = process.stdout.columns || 80;
  let height = (process.stdout.rows || 24) - 2;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function projectToScreen(
    pLat: number, pLon: number,
    tlWorldX: number, tlWorldY: number,
    zoom: number,
  ): [number, number] {
    const [wx, wy] = latLonToWorldPixel(pLat, pLon, zoom);
    const sx = (wx - tlWorldX) / cellAspect;
    const sy = wy - tlWorldY;
    return [Math.round(sx), Math.round(sy)];
  }

  function fitZoom(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
    termW: number, termH: number,
    aspect: number,
    padding = 0.70,
  ): number {
    // Compute world-pixel extents at zoom=1, then find the zoom that fits the viewport.
    const [wx1, wy1] = latLonToWorldPixel(lat1, lon1, 1);
    const [wx2, wy2] = latLonToWorldPixel(lat2, lon2, 1);
    const dx = Math.abs(wx1 - wx2) / aspect;   // screen-column units
    const dy = Math.abs(wy1 - wy2);            // screen-row units
    if (dx < 0.001 && dy < 0.001) return zoom; // same point, keep current zoom

    // z = 1 + log2(viewport / extent).  Take the tighter of W and H constraints.
    const zoomW = 1 + Math.log2((termW * padding) / dx);
    const zoomH = 1 + Math.log2((termH * padding) / dy);
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(Math.min(zoomW, zoomH))));
  }

  async function render() {
    width = process.stdout.columns || 80;
    height = (process.stdout.rows || 24) - 2;
    if (width < 20 || height < 10) return;

    // In tracking mode, auto-center and zoom to fit both markers
    if (trackingMode && tracking) {
      lat = (tracking.driverLat + tracking.destLat) / 2;
      lon = (tracking.driverLon + tracking.destLon) / 2;
      zoom = fitZoom(
        tracking.driverLat, tracking.driverLon,
        tracking.destLat,   tracking.destLon,
        width, height, cellAspect,
      );
    }

    blink = !blink;

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

            function project(pt: {x: number, y: number}, layerExtent: number) {
                const worldX = (tx + pt.x / layerExtent) * TILE_SIZE;
                const worldY = (ty + pt.y / layerExtent) * TILE_SIZE;
                return [
                    (worldX - tlWorldX) / cellAspect,
                    (worldY - tlWorldY) / 1.0
                ] as [number, number];
            }

            for (const layerName of ['landuse', 'landcover', 'water', 'building']) {
              const layer = tile.layers[layerName];
              if (!layer) continue;
              const char = layerName === 'water' ? '~' : layerName === 'building' ? '#' : "'";
              const color = layerName === 'water' ? COLORS.water : layerName === 'building' ? COLORS.building : COLORS.green;

              for (let i = 0; i < layer.length; i++) {
                const feat = layer.feature(i);
                if (feat.type === 3) {
                  const geom = feat.loadGeometry();
                  const rings = geom.map(ring => ring.map(pt => project(pt, feat.extent)));
                  fb.drawPolygonFilled(rings, char, color);
                }
              }
            }

            for (const layerName of ['road', 'transportation', 'waterway']) {
                const layer = tile.layers[layerName];
                if (!layer) continue;

                for (let i = 0; i < layer.length; i++) {
                  const feat = layer.feature(i);
                  let isHighway = false;
                  if (feat.properties.class === 'motorway' || feat.properties.class === 'trunk') isHighway = true;

                  const char = layerName === 'waterway' ? '|' : (isHighway ? '=' : '.');
                  const color = layerName === 'waterway' ? COLORS.waterway : (isHighway ? COLORS.highway : COLORS.road);

                  if (feat.type === 2) {
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

    // Draw DoorDash markers on top of map
    if (tracking) {
      // Route trail — fades from bright to dim as it ages
      for (let i = 1; i < routeTrail.length; i++) {
        const age = routeTrail.length - i;                     // 1 = newest
        const brightness = Math.max(40, 220 - age * 14);      // 220 → 40 over ~13 points
        const trailColor = (brightness << 8) | (Math.floor(brightness * 0.6)); // greenish fade
        const [ax, ay] = projectToScreen(routeTrail[i - 1].lat, routeTrail[i - 1].lon, tlWorldX, tlWorldY, zoom);
        const [bx, by] = projectToScreen(routeTrail[i].lat, routeTrail[i].lon, tlWorldX, tlWorldY, zoom);
        fb.drawLine(ax, ay, bx, by, '·', trailColor);
      }

      // Driver marker (blinking @)
      const [dx, dy] = projectToScreen(tracking.driverLat, tracking.driverLon, tlWorldX, tlWorldY, zoom);
      if (blink) fb.setChar(dx, dy, '@', COLORS.driver);
      fb.setChar(dx - 1, dy, '(', COLORS.driver);
      fb.setChar(dx + 1, dy, ')', COLORS.driver);

      // Destination marker — blinking ✓ when delivered, static [X] otherwise
      const delivered = tracking.status === 'delivered';
      const [ex, ey] = projectToScreen(tracking.destLat, tracking.destLon, tlWorldX, tlWorldY, zoom);
      if (delivered) {
        if (blink) fb.setChar(ex, ey, '*', COLORS.driver);
        fb.setChar(ex - 1, ey, '[', COLORS.driver);
        fb.setChar(ex + 1, ey, ']', COLORS.driver);
      } else {
        fb.setChar(ex, ey, 'X', COLORS.destination);
        fb.setChar(ex - 1, ey, '[', COLORS.destination);
        fb.setChar(ex + 1, ey, ']', COLORS.destination);
      }
    }

    console.clear();
    const mapStr = fb.renderToScreen();
    process.stdout.write(mapStr);

    // Status bar
    if (trackingMode && tracking) {
      const eta = tracking.etaMinutes !== null ? `ETA: ${tracking.etaMinutes}m` : 'ETA: --';
      const status = tracking.status.replace(/_/g, ' ').toLowerCase();
      const name = tracking.driverName;
      const bar = ` [DD] ${name} | ${status} | ${eta} | (@) driver  [X] you | Q quit `;
      process.stdout.write(`\x1b[38;2;255;255;0m${bar}\x1b[0m`);
    } else if (trackingMode && trackingError) {
      process.stdout.write(`\x1b[38;2;255;80;80m [DD] ${trackingError} \x1b[0m`);
    } else {
      process.stdout.write(`\x1b[38;2;255;255;255m lat: ${lat.toFixed(5)} lon: ${lon.toFixed(5)} zoom: ${zoom} | WASD/Arrows pan  +/- zoom  Q quit \x1b[0m`);
    }
  }

  // Start DoorDash tracker if --doordash flag provided
  if (options.doordash) {
    trackingMode = true;
    let cookies = '';
    if (options.cookies) {
      try {
        cookies = fs.readFileSync(options.cookies, 'utf8').trim();
      } catch {
        process.stderr.write(`Could not read cookies file: ${options.cookies}\n`);
        process.exit(1);
      }
    }

    const tracker = new DoorDashTracker(
      {
        orderUrl: options.doordash,
        cookies,
        pollIntervalMs: 4000,
        mockBaseUrl: options.mock ? "http://localhost:3456" : undefined,
      },
      (state) => {
        tracking = state;
        trackingError = '';
        routeTrail.push({ lat: state.driverLat, lon: state.driverLon });
        if (routeTrail.length > MAX_TRAIL) routeTrail.shift();
        render();
      },
      (msg) => {
        trackingError = msg;
        render();
      },
    );
    tracker.start();
  }

  render();

  // Blink timer for driver marker
  if (trackingMode) {
    setInterval(() => { if (tracking) render(); }, 800);
  }

  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.exit();
    }

    // Manual pan/zoom only when not in tracking mode
    if (!trackingMode) {
      const step = 0.1 * Math.pow(2, 14 - zoom);
      if (key.name === 'w' || key.name === 'up') lat += step;
      if (key.name === 's' || key.name === 'down') lat -= step;
      if (key.name === 'a' || key.name === 'left') lon -= step;
      if (key.name === 'd' || key.name === 'right') lon += step;
      if (str === '+' || str === '=') zoom = Math.min(zoom + 1, MAX_ZOOM);
      if (str === '-' || str === '_') zoom = Math.max(zoom - 1, MIN_ZOOM);
      render();
    } else {
      // In tracking mode, allow manual zoom override
      if (str === '+' || str === '=') { zoom = Math.min(zoom + 1, MAX_ZOOM); render(); }
      if (str === '-' || str === '_') { zoom = Math.max(zoom - 1, MIN_ZOOM); render(); }
    }
  });

  if (!trackingMode) render();
}

main().catch(console.error);
