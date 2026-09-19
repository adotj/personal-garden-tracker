#!/usr/bin/env bash
# Example Tailscale Serve setup on the home host (run after `npm run start:lan` is up).
# Requires Tailscale installed and logged in. Adjust port if you changed Next.js port.
set -euo pipefail

LOCAL_UPSTREAM="${LOCAL_UPSTREAM:-http://127.0.0.1:3000}"

echo "Proxying tailnet HTTPS -> ${LOCAL_UPSTREAM}"
sudo tailscale serve --bg --https=443 "${LOCAL_UPSTREAM}"
tailscale serve status
