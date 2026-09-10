# Hosting on forag3r.app/world

The World mini app is deployed as its own Vercel project with `basePath: /world`.
The parent Forager site (`defiproject/forager`) proxies that path on **forag3r.app**.

## Production URLs

| Surface | URL |
| --- | --- |
| **Portal App URL (canonical)** | `https://forager-world.vercel.app` |
| Mini app entry (after redirect) | `https://forager-world.vercel.app/world/enter` |
| Legacy path on parent domain | `https://forag3r.app/world/enter` |
| NextAuth `AUTH_URL` | `https://forager-world.vercel.app/world` |

### Why not `forag3r.app/world/enter` as App URL?

World App resolves absolute `path` values from the **domain root**. With App URL
`https://forag3r.app/world/enter` and `path=/`, the webview opens `https://forag3r.app/`
(the main Forager web app). The dedicated `forager-world.vercel.app` host redirects
`/`, `/enter`, `/home`, etc. into `/world/*` so the QR always loads the mini app.


## 1. Deploy this app (world mini app)

```bash
cd "world mini app"
vercel link
vercel env pull   # or set env vars in Vercel dashboard
vercel --prod
```

Note the production URL (e.g. `https://forager-world.vercel.app`).

Required Vercel env vars:

- `AUTH_SECRET`, `HMAC_SECRET_KEY`
- `AUTH_URL=https://forag3r.app/world`
- `NEXT_PUBLIC_BASE_PATH=/world`
- `NEXT_PUBLIC_SITE_URL=https://forag3r.app/world`
- `NEXT_PUBLIC_APP_ID`
- `NEXT_PUBLIC_PLATFORM_FEE_WALLET`
- `ALCHEMY_API_KEY`
- `NEXT_PUBLIC_WORLDCHAIN_RPC_URL`

## 2. Parent Forager project

In `defiproject/forager`, set on Vercel:

```env
WORLD_MINIAPP_ORIGIN=https://forager-world.vercel.app
```

The parent `next.config.ts` rewrites:

- `/world` → `{WORLD_MINIAPP_ORIGIN}/world`
- `/world/:path*` → `{WORLD_MINIAPP_ORIGIN}/world/:path*`

Redeploy the parent after setting `WORLD_MINIAPP_ORIGIN`.

## 3. World Developer Portal

Set **App URL / Integration URL** to `https://forag3r.app/world/enter`.

## Local dev

**World mini app** (with `/world` base path):

```bash
npm run dev
# → http://localhost:3000/world
```

**Parent + world together** (proxy to local world app):

```bash
# Terminal 1 — world mini app on 3001
npm run dev -- --port 3001

# Terminal 2 — parent forager
cd ../defiproject/forager
WORLD_MINIAPP_ORIGIN=http://localhost:3001 npm run dev
# → http://localhost:3000/world
```

For World App testing before DNS is live, use a tunnel pointed at the **world** app URL including `/world`:

```bash
cloudflared tunnel --url http://localhost:3001
# Portal integration URL: https://YOUR_TUNNEL.trycloudflare.com/world
```
