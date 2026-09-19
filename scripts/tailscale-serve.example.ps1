# Example Tailscale Serve on Windows (run after `npm run start:lan` is up).
# Open PowerShell as Administrator if `tailscale serve` requires elevated rights.
$LocalUpstream = if ($env:LOCAL_UPSTREAM) { $env:LOCAL_UPSTREAM } else { "http://127.0.0.1:3000" }

Write-Host "Proxying tailnet HTTPS -> $LocalUpstream"
tailscale serve --bg --https=443 $LocalUpstream
tailscale serve status
