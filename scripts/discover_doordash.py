#!/usr/bin/env python3
"""
Stage 1: DoorDash API Discovery
Run this while a DoorDash order tracking page is open in your browser.
Usage: browser-harness < scripts/discover_doordash.py
"""
import json, time

# Enable CDP network monitoring
cdp("Network.enable")
drain_events()  # clear backlog

print("Monitoring network requests for 30s...")
print("Make sure your DoorDash tracking page is open and active.\n")

seen = set()
driver_endpoint = None

for _ in range(30):
    wait(1.0)
    events = drain_events()
    for ev in events:
        if ev.get("method") == "Network.responseReceived":
            params = ev.get("params", {})
            url = params.get("response", {}).get("url", "")
            req_id = params.get("requestId")

            # Filter for DoorDash API calls likely to have location data
            if "doordash" in url and req_id not in seen:
                if any(k in url for k in ["order", "track", "delivery", "dasher", "status"]):
                    seen.add(req_id)
                    print(f"[FOUND] {url}")

                    # Fetch the response body
                    try:
                        body_resp = cdp("Network.getResponseBody", requestId=req_id)
                        body_text = body_resp.get("body", "")
                        try:
                            body = json.loads(body_text)
                        except Exception:
                            body = body_text[:500]

                        # Check if it has location-like fields
                        body_str = json.dumps(body).lower()
                        if any(k in body_str for k in ["lat", "lng", "lon", "location", "dasher"]):
                            print(f"  *** LOCATION DATA FOUND ***")
                            print(f"  URL: {url}")
                            print(f"  Body preview: {json.dumps(body)[:1000]}")
                            driver_endpoint = url
                        else:
                            print(f"  (no location data, skipping)")
                    except Exception as e:
                        print(f"  Could not get body: {e}")

        # Also capture request headers for auth
        if ev.get("method") == "Network.requestWillBeSent":
            params = ev.get("params", {})
            url = params.get("request", {}).get("url", "")
            if driver_endpoint and driver_endpoint in url:
                headers = params.get("request", {}).get("headers", {})
                print(f"\n[AUTH HEADERS for {url}]")
                for k, v in headers.items():
                    if k.lower() in ["cookie", "authorization", "x-csrf-token", "x-dd-", "content-type"]:
                        print(f"  {k}: {v[:80]}...")

print("\n--- Discovery complete ---")
if driver_endpoint:
    print(f"Target endpoint: {driver_endpoint}")
else:
    print("No location endpoint found. Make sure a tracking page is open and reloading.")
