# World Sweep

A World App mini app that lets users sell junk mini-app tokens from their World Chain wallet in **one batched transaction** and receive native **WLD**. The app takes a **5% platform fee** on the WLD received from swaps.

## What it does

1. Authenticates the user with World App wallet auth (MiniKit)
2. Scans the wallet for ERC-20 balances (via Etherscan API v2 for World Chain)
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
| `AUTH_URL` | Your ngrok or production URL |
| `NEXT_PUBLIC_APP_ID` | App ID from [developer.worldcoin.org](https://developer.worldcoin.org) |
| `NEXT_PUBLIC_PLATFORM_FEE_WALLET` | Your World wallet address for the 5% fee |
| `ETHERSCAN_API_KEY` | Free API key from [etherscan.io](https://etherscan.io) (used for World Chain via API v2) |

### 3. Developer Portal setup

In [developer.worldcoin.org](https://developer.worldcoin.org) → your mini app → **Permissions**, allowlist:

**Permit2 Tokens** — every junk ERC-20 your users may sweep

**Contract Entrypoints**

- Uniswap V3 SwapRouter: `0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6`
- WLD token (for fee transfer): `0x2cFc85d8E48F8EAB294be644d9E25C3030863003`

### 4. Run locally

```bash
npm run dev
ngrok http 3000
```

Point your mini app URL in the Developer Portal to your ngrok URL.

### 5. Test in World App

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
