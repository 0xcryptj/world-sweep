// Mirrors the /api/token-icon resolution pipeline against a real wallet and
// prints symbol -> winning source. Usage: node scripts/verify-token-icons.mjs [wallet]
const WALLET =
  process.argv[2] ?? '0xE91A0B039159D3a50e65d337255FE0169B548260';

const UA = 'ForagerWorldMiniApp/1.0 (+https://forag3r.app/world)';

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function imageOk(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/*,*/*;q=0.8', 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return false;
    const bytes = await res.arrayBuffer();
    return bytes.byteLength >= 32;
  } catch {
    return false;
  }
}

async function resolve(address) {
  const lower = address.toLowerCase();

  if (await imageOk(`https://dd.dexscreener.com/ds-data/tokens/worldchain/${lower}.png`)) {
    return 'dexscreener-cdn';
  }

  const ds = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  const dsImg = ds?.pairs?.find(
    (p) =>
      p?.chainId === 'worldchain' &&
      p?.info?.imageUrl &&
      p?.baseToken?.address?.toLowerCase() === lower,
  )?.info?.imageUrl;
  if (dsImg && (await imageOk(dsImg))) return 'dexscreener-api';

  const gt = await fetchJson(
    `https://api.geckoterminal.com/api/v2/networks/world-chain/tokens/${lower}`,
  );
  const gtImg = gt?.data?.attributes?.image_url;
  if (gtImg && gtImg !== 'missing.png' && (await imageOk(gtImg))) {
    return 'geckoterminal';
  }

  const bs = await fetchJson(
    `https://worldchain-mainnet.explorer.alchemy.com/api/v2/tokens/${address}`,
  );
  if (bs?.icon_url && (await imageOk(bs.icon_url))) return 'blockscout';

  return 'FALLBACK-AVATAR';
}

const walletJson = await (
  await fetch(`https://forag3r.app/world/api/tokens?address=${WALLET}`)
).json();
const tokens = [
  ...walletJson.tokens.map((t) => ({ symbol: t.symbol, address: t.address, sweepable: true })),
  ...walletJson.excluded
    .filter((t) => t.symbol !== 'UNKNOWN')
    .map((t) => ({ symbol: t.symbol, address: t.address, sweepable: false })),
];

console.log(`Resolving icons for ${tokens.length} tokens in ${WALLET}\n`);
let hits = 0;
for (const token of tokens) {
  const source = await resolve(token.address);
  if (source !== 'FALLBACK-AVATAR') hits += 1;
  console.log(
    `${token.symbol.padEnd(12)} ${(token.sweepable ? '[sweep]' : '       ')} -> ${source}`,
  );
  // Stay under GeckoTerminal's 30 req/min public rate limit.
  await new Promise((r) => setTimeout(r, 2500));
}
console.log(`\nResolved: ${hits}/${tokens.length} tokens have a real icon.`);
