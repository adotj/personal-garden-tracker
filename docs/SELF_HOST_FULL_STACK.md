# Full self-host (Next.js + Supabase on enigma)

Garden-only LAN/Tailscale hosting is in [HOSTING.md](./HOSTING.md). This doc is the **multi-app + self-hosted Supabase** roadmap.

**Homelab root (all apps):** [`E:\Garden Tracker\homelab\README.md`](../../homelab/README.md)

## Current status

| Item | Status |
|------|--------|
| Garden repo + migrations | Ready |
| Gym + Keeper cloned under `E:\Garden Tracker\` | Done |
| Docker on enigma | **Not installed** — required before Supabase locally |
| Cloud Supabase | Still source of truth until migration |

## Local Supabase URLs (after `supabase start` or Docker stack)

Default CLI / demo keys (rotate in production self-host):

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# anon key: run `npx supabase status` after start
```

For **iPhone via Tailscale**, use the **Serve HTTPS URL** to Kong (port 54321), not `127.0.0.1`.

## Garden migration (first app)

1. Install Docker Desktop; verify `docker ps`.
2. From this repo: `npx supabase start` (dev) **or** homelab production compose.
3. `npx supabase db reset` or apply `supabase/migrations` against local DB.
4. Export cloud project `ofhlfbilojlbqmddfwpx` (dashboard backup or `pg_dump`).
5. Import into local DB; copy storage bucket `plant-photos`.
6. Update `.env.local` and Supabase Auth URLs (Tailscale HTTPS).
7. `npm run build && npm run start:lan` — verify before pausing cloud.

## Pause cloud (manual, after verification)

- Supabase: dashboard → project → pause (or ask agent with explicit confirmation).
- Vercel: delete/pause **laveen-garden-tracker** when local replaces it.

Do **not** pause cloud Supabase until local auth + storage work for garden.
