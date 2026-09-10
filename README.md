# Forager

A World App mini app that lets users sell junk mini-app tokens from their World Chain wallet in **one batched transaction** and receive native **WLD**. The app takes a **5% platform fee** on the WLD received from swaps.

## What it does

1. Authenticates the user with World App wallet auth (MiniKit)
2. Scans the wallet for ERC-20 balances (via Alchemy Token API on World Chain)
3. Excludes protected assets (WLD, WETH, USDC, WBTC)
4. Quotes Uniswap V3 routes to WLD for each selected token
5. Builds a single atomic `sendTransaction` batch:
   - swap each token → WLD
   - transfer 5% of minimum expected WLD to your platform wallet

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.sample` to `.env.local` and fill in:

| Variable | Description |
| --- | --- |
| `AUTH_SECRET` | Random secret for NextAuth (`openssl rand -base64 32`) |
| `AUTH_URL` | `https://forag3r.app/world` in production (must include `/world`) |
| `NEXT_PUBLIC_BASE_PATH` | `/world` — subpath on forag3r.app |
| `NEXT_PUBLIC_SITE_URL` | `https://forag3r.app/world` |
| `NEXT_PUBLIC_APP_ID` | App ID from [developer.worldcoin.org](https://developer.worldcoin.org) |
| `NEXT_PUBLIC_PLATFORM_FEE_WALLET` | Your World wallet address for the 5% fee |
| `ALCHEMY_API_KEY` | Free API key from [alchemy.com](https://www.alchemy.com) (World Chain token balances) |
| `NEXT_PUBLIC_WORLDCHAIN_RPC_URL` | Optional, **keyless only** (ships in the client bundle). Defaults to `https://worldchain-mainnet.g.alchemy.com/public`. NEVER put an API-keyed URL here — the server builds its own keyed endpoint from `ALCHEMY_API_KEY`. |

### 3. Developer Portal setup

In [developer.worldcoin.org](https://developer.worldcoin.org) → your mini app → **Permissions**, allowlist:

**Permit2 Tokens** — every junk ERC-20 your users may sweep

**Contract Entrypoints**

- Uniswap V3 SwapRouter: `0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6`
- WLD token (for fee transfer): `0x2cFc85d8E48F8EAB294be644d9E25C3030863003`

### 4. Run locally

```bash
npm run dev
# App runs at http://localhost:3000/world
```

For World App testing, tunnel the dev server and include `/world` in the portal URL:

```bash
cloudflared tunnel --url http://localhost:3000
# Portal integration URL: https://YOUR_TUNNEL.trycloudflare.com/world
```

### 5. Deploy on forag3r.app/world

This app is hosted under the parent Forager site at **https://forag3r.app/world**.

1. Deploy this repo to Vercel (see `deploy/PARENT_INTEGRATION.md`)
2. Set `WORLD_MINIAPP_ORIGIN` on the parent `defiproject/forager` Vercel project
3. Set World Developer Portal integration URL to `https://forag3r.app/world/enter`

### 6. Test in World App

Use the Developer Portal testing flow to open the app inside World App on your phone.

## Architecture

```
src/
  lib/
    constants.ts   # chain + contract addresses, fee config
    tokens.ts      # wallet token scan
    sweep.ts       # quote + transaction builder
  app/api/
    tokens/        # GET wallet tokens
    build-sweep/   # POST build batched swap + fee tx
  components/Sweep # main UI
```

## Notes

- Tokens without Uniswap V3 liquidity to WLD are skipped automatically.
- Quotes use QuoterV2 with 3% slippage protection on minimum output.
- Max **10 tokens** per sweep to keep transaction size reasonable.
- Open inside **World App** for `sendTransaction` — browser preview is read-only for scanning.

## License

MIT
