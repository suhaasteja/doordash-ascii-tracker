/**
 * Mock DoorDash tracking server.
 * Driver follows real Toronto streets from CN Tower to Distillery District.
 *
 * Terminal 1:  node scripts/mock_doordash_server.mjs
 * Terminal 2:  node dist/index.js \
 *                --doordash "http://localhost:3456/orders/mock-order-uuid/tracking" \
 *                --mock
 */

import http from "http";

// Real street waypoints: Tartine Bakery (Mission) → 18th St → Mission St → Oracle Park (SoMa)
// Traced along actual SF streets.
const WAYPOINTS = [
  { lat: 37.7580, lng: -122.4252 }, // Driver start (south of Tartine, Guerrero St)
  { lat: 37.7613, lng: -122.4238 }, // Tartine Bakery pickup (3600 18th St)
  { lat: 37.7613, lng: -122.4150 }, // East on 18th St
  { lat: 37.7613, lng: -122.4050 }, // 18th St at Valencia
  { lat: 37.7650, lng: -122.4000 }, // North on Mission St
  { lat: 37.7700, lng: -122.3965 }, // Mission St continuing north
  { lat: 37.7745, lng: -122.3930 }, // Mission St toward SoMa
  { lat: 37.7775, lng: -122.3910 }, // 3rd St heading to waterfront
  { lat: 37.7786, lng: -122.3893 }, // Oracle Park / delivery destination
];

const DESTINATION = WAYPOINTS[WAYPOINTS.length - 1];
const RESTAURANT  = WAYPOINTS[1];

const STAGES = [
  { status: "order_placed",           etaMin: 35, waypointFrac: 0.00 },
  { status: "preparing",              etaMin: 28, waypointFrac: 0.00 },
  { status: "dasher_assigned",        etaMin: 22, waypointFrac: 0.05 },
  { status: "dasher_enroute_pickup",  etaMin: 18, waypointFrac: 0.15 },
  { status: "dasher_at_store",        etaMin: 14, waypointFrac: 0.20 },
  { status: "dasher_picked_up",       etaMin: 12, waypointFrac: 0.20 },
  { status: "dasher_enroute_dropoff", etaMin: 8,  waypointFrac: 0.55 },
  { status: "dasher_enroute_dropoff", etaMin: 4,  waypointFrac: 0.80 },
  { status: "delivered",              etaMin: 0,  waypointFrac: 1.00 },
];

let tick = 0;
const TICK_MS = 4000;

// Interpolate along the waypoint path. frac in [0,1].
function positionAlongRoute(frac) {
  if (frac <= 0) return { ...WAYPOINTS[0] };
  if (frac >= 1) return { ...WAYPOINTS[WAYPOINTS.length - 1] };

  const totalSegments = WAYPOINTS.length - 1;
  const scaled = frac * totalSegments;
  const seg = Math.floor(scaled);
  const t = scaled - seg;

  const a = WAYPOINTS[Math.min(seg, WAYPOINTS.length - 1)];
  const b = WAYPOINTS[Math.min(seg + 1, WAYPOINTS.length - 1)];
  return {
    lat: a.lat + (b.lat - a.lat) * t + (Math.random() - 0.5) * 0.00015,
    lng: a.lng + (b.lng - a.lng) * t + (Math.random() - 0.5) * 0.00015,
  };
}

function buildResponse(tick) {
  const stage = STAGES[Math.min(tick, STAGES.length - 1)];
  const pos = positionAlongRoute(stage.waypointFrac);
  const etaDate = new Date(Date.now() + stage.etaMin * 60 * 1000).toISOString();

  return {
    id: "mock-order-uuid",
    active_delivery: {
      dasher_status: stage.status,
      estimated_delivery_time: etaDate,
      dasher: { first_name: "Alex" },
      dasher_location: { lat: pos.lat, lng: pos.lng },
    },
    delivery_address: {
      lat: DESTINATION.lat,
      lng: DESTINATION.lng,
      printable_address: "Oracle Park, 24 Willie Mays Plaza, San Francisco CA",
    },
    pickup_address: {
      lat: RESTAURANT.lat,
      lng: RESTAURANT.lng,
      printable_address: "Tartine Bakery, 3600 18th St, San Francisco CA",
    },
  };
}

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url?.includes("/orders/") && req.method === "GET") {
    const body = buildResponse(tick);
    const stage = STAGES[Math.min(tick, STAGES.length - 1)];
    const loc = body.active_delivery.dasher_location;
    console.log(`[tick ${tick}] ${stage.status.padEnd(26)} driver=(${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})  ETA: ${stage.etaMin}m`);
    res.writeHead(200);
    res.end(JSON.stringify(body));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  }
});

server.listen(3456, () => {
  console.log("Mock DoorDash server  http://localhost:3456");
  console.log("Route: Tartine Bakery (Mission) → 18th St → Mission St → Oracle Park (SoMa)");
  console.log(`Stage advances every ${TICK_MS / 1000}s\n`);
  setInterval(() => { if (tick < STAGES.length - 1) tick++; }, TICK_MS);
});
