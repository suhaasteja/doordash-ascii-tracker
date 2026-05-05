export interface TrackingState {
  driverLat: number;
  driverLon: number;
  destLat: number;
  destLon: number;
  status: string;
  etaMinutes: number | null;
  driverName: string;
}

export interface DoorDashConfig {
  orderUrl: string;
  cookies: string;        // raw Cookie header string
  pollIntervalMs: number;
  mockBaseUrl?: string;   // if set, hits this instead of doordash.com
}

// Known DoorDash consumer tracking endpoints (discovered via Stage 1 recon).
// The order UUID is extracted from the tracking URL.
const ORDER_UUID_RE = /\/orders\/([a-zA-Z0-9-]{6,})/;

function extractOrderId(url: string): string | null {
  const m = url.match(ORDER_UUID_RE);
  return m ? m[1] : null;
}

async function fetchTracking(orderId: string, cookies: string): Promise<TrackingState | null> {
  // DoorDash consumer GraphQL endpoint for order status + dasher location
  const endpoint = `https://www.doordash.com/graphql`;
  const query = {
    operationName: "getConsumerOrderDetails",
    variables: { orderId },
    query: `query getConsumerOrderDetails($orderId: String!) {
      order(id: $orderId) {
        id
        activeDate
        deliveryAddress { lat lng }
        activeDelivery {
          dasherStatus
          estimatedDeliveryTime
          dasher { firstName }
          dasherLocation { lat lng }
        }
      }
    }`
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": `https://www.doordash.com/orders/${orderId}/tracking`,
        "Origin": "https://www.doordash.com",
      },
      body: JSON.stringify(query),
    });

    if (!res.ok) return null;
    const json = await res.json() as any;
    const order = json?.data?.order;
    if (!order) return null;

    const delivery = order.activeDelivery;
    const loc = delivery?.dasherLocation;
    const dest = order.deliveryAddress;
    if (!loc || !dest) return null;

    let etaMinutes: number | null = null;
    if (delivery.estimatedDeliveryTime) {
      const eta = new Date(delivery.estimatedDeliveryTime);
      etaMinutes = Math.round((eta.getTime() - Date.now()) / 60000);
    }

    return {
      driverLat: loc.lat,
      driverLon: loc.lng,
      destLat: dest.lat,
      destLon: dest.lng,
      status: delivery.dasherStatus ?? "unknown",
      etaMinutes,
      driverName: delivery.dasher?.firstName ?? "Driver",
    };
  } catch {
    return null;
  }
}

// REST fallback — DoorDash also exposes a simpler order status REST endpoint
async function fetchTrackingRest(orderId: string, cookies: string, baseUrl = "https://www.doordash.com"): Promise<TrackingState | null> {
  const endpoint = `${baseUrl}/orders/${orderId}/`;
  try {
    const res = await fetch(endpoint, {
      headers: {
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": `https://www.doordash.com/orders/${orderId}/tracking`,
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json() as any;

    const loc = json?.active_delivery?.dasher_location ?? json?.dasher_location;
    const dest = json?.delivery_address ?? json?.order?.delivery_address;
    if (!loc || !dest) return null;

    let etaMinutes: number | null = null;
    if (json?.active_delivery?.estimated_delivery_time) {
      const eta = new Date(json.active_delivery.estimated_delivery_time);
      etaMinutes = Math.round((eta.getTime() - Date.now()) / 60000);
    }

    return {
      driverLat: loc.lat ?? loc.latitude,
      driverLon: loc.lng ?? loc.longitude,
      destLat: dest.lat ?? dest.latitude,
      destLon: dest.lng ?? dest.longitude,
      status: json?.active_delivery?.dasher_status ?? "unknown",
      etaMinutes,
      driverName: json?.active_delivery?.dasher?.first_name ?? "Driver",
    };
  } catch {
    return null;
  }
}

export class DoorDashTracker {
  private config: DoorDashConfig;
  private orderId: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onUpdate: (state: TrackingState) => void;
  private onError: (msg: string) => void;

  constructor(
    config: DoorDashConfig,
    onUpdate: (state: TrackingState) => void,
    onError: (msg: string) => void,
  ) {
    this.config = config;
    const id = extractOrderId(config.orderUrl);
    if (!id) throw new Error(`Could not extract order ID from URL: ${config.orderUrl}`);
    this.orderId = id;
    this.onUpdate = onUpdate;
    this.onError = onError;
  }

  async poll() {
    let state: TrackingState | null = null;
    if (this.config.mockBaseUrl) {
      state = await fetchTrackingRest(this.orderId, "", this.config.mockBaseUrl);
    } else {
      state = await fetchTracking(this.orderId, this.config.cookies);
      if (!state) state = await fetchTrackingRest(this.orderId, this.config.cookies);
    }

    if (state) {
      this.onUpdate(state);
    } else {
      this.onError("Could not fetch location — check cookies or order status");
    }

    this.timer = setTimeout(() => this.poll(), this.config.pollIntervalMs);
  }

  start() { this.poll(); }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
}
