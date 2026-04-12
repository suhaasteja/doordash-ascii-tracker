export const TILE_SIZE = 256;
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 14;

export function latLonToWorldPixel(lat: number, lon: number, zoom: number, tileSize: number = TILE_SIZE): [number, number] {
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = (lon / 360 + 0.5) * tileSize;
  let y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * tileSize;
  
  const scale = Math.pow(2, zoom);
  return [x * scale, y * scale];
}

export function worldPixelToLatLon(wx: number, wy: number, zoom: number, tileSize: number = TILE_SIZE): [number, number] {
  const scale = Math.pow(2, zoom);
  const x = wx / scale;
  const y = wy / scale;
  
  const lon = (x / tileSize - 0.5) * 360;
  const n = Math.PI - (2 * Math.PI * y) / tileSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  
  return [lat, lon];
}
