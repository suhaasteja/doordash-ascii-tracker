# doordash-ascii-tracker

Watch your DoorDash order live in the terminal — driver location, ETA, and status rendered on a real ASCII map.

## Features

- **Live driver tracking** — polls DoorDash every 4s, blinking `(@)` moves across the map in real time
- **Auto-centering** — map auto-centers and zooms between the driver and your address
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

The map will appear centered between the driver and your door. Press `Q` to quit.

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
| `~` | Water |
| `#` | Buildings |
| `'` | Green space |
| `.` | Roads |
| `=` | Highways |

## How it works

DoorDash's consumer tracking page fetches driver coordinates from their internal API. This tool reads those same endpoints (using your browser session cookies) and re-renders the position on a real vector tile map every 4 seconds.

For API endpoint discovery (useful if DoorDash changes their API), run:

```bash
browser-harness < scripts/discover_doordash.py
```

while your tracking page is open — it sniffs all network requests via Chrome DevTools Protocol and prints any response containing location data.
