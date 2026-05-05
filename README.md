# doordash-ascii-tracker

Watch your DoorDash order live in the terminal — driver location, ETA, and status rendered on a real ASCII map.

## Demo

<!-- GIF coming soon -->
*Demo: Tartine Bakery (Mission District) → Oracle Park, San Francisco*

## Features

- **Live driver tracking** — polls DoorDash every 4s, blinking `(@)` moves across the map in real time
- **Smart zoom** — viewport auto-centers and zooms to always fit both driver and destination
- **Delivered state** — destination flips to blinking `[*]` when the order arrives
- **Status bar** — shows driver name, delivery status, and ETA
- **Full map explorer** — truecolor ASCII map powered by OpenFreeMap vector tiles
- **Fast** — parallel tile fetching, local disk cache, 24-bit color render engine

## Install

```bash
npm install -g doordash-ascii-tracker
```

Or run directly:

```bash
npx doordash-ascii-tracker
```

## Usage

### Track a live DoorDash order

1. Open your DoorDash tracking page in Chrome
2. Open DevTools → Network tab → click any request to `doordash.com` → copy the `Cookie` header value
3. Paste it into a file, e.g. `~/.dd_cookies`
4. Run:

```bash
ascii-map \
  --doordash "https://www.doordash.com/orders/<your-order-uuid>/tracking" \
  --cookies ~/.dd_cookies
```

The map appears centered between the driver and your door, zoomed to fit both. Press `Q` to quit.

### Try the demo (no order needed)

Simulates a real delivery — Tartine Bakery (Mission District) → Oracle Park (SoMa) — along actual SF streets.

**Terminal 1:**
```bash
node scripts/mock_doordash_server.mjs
```

**Terminal 2:**
```bash
ascii-map \
  --doordash "http://localhost:3456/orders/mock-order-uuid/tracking" \
  --mock
```

Driver advances through 9 stages every 4 seconds. Watch the zoom adjust dynamically as the driver closes in.

### Explore the map manually

```bash
ascii-map
ascii-map --lat 40.7128 --lon -74.0060 --zoom 13   # New York
```

## Controls

| Key | Action |
| :--- | :--- |
| **W/A/S/D** / **Arrows** | Pan map (manual mode only) |
| **+** / **-** | Zoom in / out |
| **Q** / **Ctrl+C** | Quit |

## Map legend

| Symbol | Meaning |
| :--- | :--- |
| `(@)` | Driver (blinking) |
| `[X]` | Your delivery address |
| `[*]` | Delivered! (blinking) |
| `~` | Water |
| `#` | Buildings |
| `'` | Green space |
| `.` | Roads |
| `=` | Highways |

## How it works

DoorDash's consumer tracking page fetches driver coordinates from their internal API. This tool reads those same endpoints (using your browser session cookies) and re-renders the position on a real vector tile map every 4 seconds. Zoom level is calculated from the actual world-pixel distance between driver and destination, scaled to fit the terminal viewport.

For API endpoint discovery (useful if DoorDash changes their API), run:

```bash
browser-harness < scripts/discover_doordash.py
```

while your tracking page is open — it sniffs all network requests via Chrome DevTools Protocol and prints any response containing location data.
