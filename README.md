# ascii-map

A high-performance, truecolor terminal-based ASCII map explorer. Rewritten in TypeScript/Node for 100x better performance!

## Features
- **100x Faster**: Truecolor (24-bit) render engine with optimized scanline polygon filling
- **Parallel Fetching**: MVT vector tiles loaded concurrently via native Fetch API
- **Dynamic Decoding**: Uses Mapbox Vector Tile and Protobuf directly in JS for instant parses
- **Production Ready**: Fully compiled and ready to be used as a global NPM cli tool.

## Install

```bash
npm install -g ascii-map-cli
```
Or run directly using `npx`:
```bash
npx ascii-map-cli
```

## Run

```bash
npm start
# OR
ascii-map
```

## Controls

| Key | Action |
| :--- | :--- |
| **W/A/S/D** / **Arrows** | Pan map |
| **+** / **-** | Zoom in / out |
| **Q** / **Ctrl+C** | Quit |
