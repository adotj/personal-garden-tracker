# Host at home + Tailscale (free)

Run this Next.js app on a machine at home instead of Vercel. **Supabase** (database, auth, storage) stays in the cloud—only the app server moves.

For **self-hosted Supabase** and running **garden + gym + keeper** together, see [SELF_HOST_FULL_STACK.md](./SELF_HOST_FULL_STACK.md) and `E:\Garden Tracker\homelab\`.

## Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) project (already used by this app)
- Optional former Vercel env vars to copy
- [Tailscale](https://tailscale.com) free **Personal** plan (up to 6 users, unlimited user devices)

## 1. Environment variables

On the **home host** (the PC/NAS that runs the app):

**Linux / macOS:**

```bash
cp .env.example .env.local
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env.local
```

Fill in from **Supabase Dashboard → Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Or copy the same values from your Vercel project **Settings → Environment Variables** before you delete the Vercel project.

Never commit `.env.local` (it is gitignored).

`.env.local` must exist **before** `npm run build`—Next.js loads it at build time for this app.

## 2. Install, build, and run on LAN

From the repo root on the home host:

```bash
npm ci
npm run build
npm run start:lan
```

`start:lan` binds to `0.0.0.0:3000` so other devices on Wi‑Fi can reach the app.

1. Give the host a **DHCP reservation** in your router so its LAN IP stays stable.
2. On another device on the same Wi‑Fi, open `http://<LAN-IP>:3000`.
3. **Do not** port-forward port 3000 on your router to the internet.

For development only: `npm run dev` (Serwist/PWA is disabled in development).

## 3. Tailscale + Serve (access from anywhere, household)

1. Create a Tailscale **Personal** tailnet at [login.tailscale.com](https://login.tailscale.com).
2. **Invite household members** (≤6 users total). Each person installs Tailscale on their phones/laptops.
3. Install Tailscale on the **home host** and sign in to the same tailnet.
4. Enable **MagicDNS** in the Tailscale admin console (recommended).

On the home host, expose the local app with [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve):

```bash
# Example: HTTPS on your tailnet only (not public Funnel)
sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
```

Check status and the exact URL:

```bash
tailscale serve status
```

Use that **HTTPS** URL (e.g. `https://your-machine.your-tailnet.ts.net`) from phones on cellular with Tailscale **on**. Avoid **Tailscale Funnel** unless you intentionally want a public internet URL.

See also: [scripts/tailscale-serve.example.sh](../scripts/tailscale-serve.example.sh) (Linux/macOS) or [scripts/tailscale-serve.example.ps1](../scripts/tailscale-serve.example.ps1) (Windows).

**Windows:** Install Tailscale from the [Windows download page](https://tailscale.com/download/windows). In an elevated PowerShell:

```powershell
tailscale serve --bg --https=443 http://127.0.0.1:3000
tailscale serve status
```

If other PCs on your LAN cannot reach the app, allow **Node.js** (or port **3000**) through **Windows Defender Firewall** for **Private** networks only.

## 4. Supabase Auth URL configuration

In **Supabase Dashboard → Authentication → URL Configuration**:

| Setting | Value |
|--------|--------|
| **Site URL** | Your primary URL—prefer the **Tailscale Serve HTTPS URL** you use daily |
| **Redirect URLs** | Same HTTPS origin; optionally add `http://<LAN-IP>:3000/**`, `http://localhost:3000/**` |

Sign-in in this app is **email + password**. A wrong Site URL causes flaky sessions after login.

## 5. Keep Next.js running after reboot

Tailscale usually starts on boot; **Next.js does not** unless you configure it.

### Option A: systemd (Linux)

1. Edit [scripts/systemd/laveen-garden-tracker.service.example](../scripts/systemd/laveen-garden-tracker.service.example): set `User`, `WorkingDirectory`, and ensure `.env.local` is loaded (the example uses `EnvironmentFile`).
2. Install:

```bash
sudo cp scripts/systemd/laveen-garden-tracker.service.example /etc/systemd/system/laveen-garden-tracker.service
sudo systemctl daemon-reload
sudo systemctl enable --now laveen-garden-tracker.service
```

### Option B: pm2 (Linux, macOS, or Windows)

```bash
npm install -g pm2
pm2 start npm --name garden -- run start:lan
pm2 save
pm2 startup
```

On **Windows**, use `pm2 startup` and follow the printed command so the process restarts after login.

### Option C: Windows Task Scheduler

1. Create a task that runs **At startup** (or at log on).
2. Action: **Start a program** → `npm` with arguments `run start:lan`.
3. **Start in:** full path to this repo (where `.env.local` lives).
4. Enable **Run whether user is logged on or not** only if you need the app while logged out (requires stored credentials).

After reboot, confirm `npm run start:lan` is up before `tailscale serve` can proxy traffic.

## 6. Remove from Vercel (free a project slot)

When home + Tailscale works:

1. [Vercel Dashboard](https://vercel.com/dashboard) → this project → **Settings → General → Delete Project** (or disconnect Git).
2. Update any bookmarks from the old `*.vercel.app` URL to your Tailscale HTTPS URL.

## Verification checklist

- [ ] `http://<LAN-IP>:3000` works on home Wi‑Fi
- [ ] Tailscale Serve HTTPS URL works on a phone **off Wi‑Fi** with Tailscale enabled
- [ ] Sign in, add/edit/delete plants, upload a photo, weather widget loads
- [ ] Session persists after refresh on the Tailscale URL
- [ ] Vercel project removed

## Tradeoffs vs Vercel

| | Vercel | Home + Tailscale |
|--|--------|-------------------|
| Uptime | Always on | Home host must be on |
| Who can open the app | Anyone with the link | Tailnet devices only |
| Client setup | None | Tailscale on each device |
| Cost | Free tier limits | $0 (Personal Tailscale + Supabase free tier) |

## Optional: HTTPS on LAN only (no Tailscale)

For PWA “Add to Home Screen” on LAN without Tailscale, use **Caddy** or **mkcert** in front of `127.0.0.1:3000`. Tailscale Serve already provides HTTPS for remote access on the tailnet.
