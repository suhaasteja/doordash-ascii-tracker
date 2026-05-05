#!/bin/bash
# Stage 3 verification: test the map renders with a fake DoorDash URL
# Uses a mock order ID — the tracker will fail to fetch but the CLI flag wires up correctly.
# To fully test, supply a real order URL + cookies file.

echo "Testing CLI flag parsing..."
node dist/index.js --help

echo ""
echo "Mock tracking test: map should start in tracking mode."
echo "Since no real cookies, expect the error bar to show, not crash."
echo "Press Q to exit."
echo ""

# Fake URL with a valid-shaped UUID
node dist/index.js \
  --doordash "https://www.doordash.com/orders/12345678-1234-1234-1234-123456789abc/tracking"
