/**
 * Bulk-downloads token icons from Dexscreener → GeckoTerminal → Blockscout and
 * writes them to `public/token-icons/{address}.{ext}`. Regenerates
 * `src/lib/token-icon-manifest.ts` so client code can prefer the static icon
 * without a per-render network round-trip.
 *
 * Usage:
 *   npx tsx scripts/download-token-icons.ts                  # allowlist only
 *   npx tsx scripts/download-token-icons.ts <wallet>         # allowlist + wallet holdings
 *   npx tsx scripts/download-token-icons.ts <wallet> --force # re-download even if present
 */
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { PORTAL_PERMIT2_TOKEN_ADDRESSES } from '../src/lib/allowlist';

const ROOT = resolve(process.cwd());
const ICONS_DIR = join(ROOT, 'public', 'token-icons');
const MANIFEST_PATH = join(ROOT, 'src', 'lib', 'token-icon-manifest.ts');

const UA = 'ForagerWorldMiniApp/1.0 (+https://forag3r.app/world)';
const JSON_HEADERS = { Accept: 'application/json', 'User-Agent': UA };
const IMAGE_HEADERS = {
  Accept: 'image/avif,image/webp,image/apng,image/png,image/*,*/*;q=0.8',
  'User-Agent': UA,
};

function loadEnvLocal() {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

type DexScreenerPair = {
  chainId?: string;
  baseToken?: { address?: string };
  info?: { imageUrl?: string };
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: JSON_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes('svg')) return 'svg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('gif')) return 'gif';
  return 'png';
}

async function downloadImage(
  url: string,
  addressLower: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: IMAGE_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength < 64) return null;

    const ext = extensionForContentType(contentType);
    const outPath = join(ICONS_DIR, `${addressLower}.${ext}`);
    writeFileSync(outPath, buffer);
    return outPath;
  } catch {
    return null;
  }
}

async function resolveIconSources(address: string): Promise<string[]> {
  const lower = address.toLowerCase();
  const urls: string[] = [];

  urls.push(`https://dd.dexscreener.com/ds-data/tokens/worldchain/${lower}.png`);

  const ds = await fetchJson<{ pairs?: DexScreenerPair[] | null }>(
    `https://api.dexscreener.com/latest/dex/tokens/${address}`,
  );
  const dsImg = ds?.pairs?.find(
    (p) =>
      p?.chainId === 'worldchain' &&
      p?.info?.imageUrl &&
      p?.baseToken?.address?.toLowerCase() === lower,
  )?.info?.imageUrl;
  if (dsImg) urls.push(dsImg);

  const gt = await fetchJson<{
    data?: { attributes?: { image_url?: string | null } };
  }>(
    `https://api.geckoterminal.com/api/v2/networks/world-chain/tokens/${lower}`,
  );
  const gtImg = gt?.data?.attributes?.image_url;
  if (gtImg && gtImg !== 'missing.png') urls.push(gtImg);

  // CoinGecko covers a different (partially overlapping) slice of tokens than
  // GeckoTerminal — the /coins/{platform}/contract/{addr} endpoint returns
  // hosted image URLs (thumb/small/large) even when GT is rate-limited.
  const cg = await fetchJson<{
    image?: { large?: string | null; small?: string | null };
    error?: string;
  }>(
    `https://api.coingecko.com/api/v3/coins/world-chain/contract/${lower}`,
  );
  const cgImg = cg?.image?.large ?? cg?.image?.small;
  if (cgImg) urls.push(cgImg);

  const bs = await fetchJson<{ icon_url?: string | null }>(
    `https://worldchain-mainnet.explorer.alchemy.com/api/v2/tokens/${address}`,
  );
  if (bs?.icon_url) urls.push(bs.icon_url);

  return urls;
}

function readCoveredAddresses(): Map<string, string> {
  if (!existsSync(ICONS_DIR)) return new Map();
  const covered = new Map<string, string>();
  for (const file of readdirSync(ICONS_DIR)) {
    if (file.startsWith('.')) continue;
    const ext = extname(file).replace(/^\./, '').toLowerCase();
    if (!ext) continue;
    const base = basename(file, extname(file)).toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(base)) {
      covered.set(base, ext);
    }
  }
  return covered;
}

function writeManifest(covered: Map<string, string>) {
  const entries = [...covered.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = `// Auto-generated by scripts/download-token-icons.ts.
// Maps lowercase token addresses to the file extension of the static icon
// committed under \`public/token-icons/{address}.{ext}\`. Do not edit by hand.

export const LOCAL_TOKEN_ICONS: Record<string, string> = {
${entries.map(([addr, ext]) => `  '${addr}': '${ext}',`).join('\n')}
};

export function getLocalTokenIconPath(address: string): string | null {
  const ext = LOCAL_TOKEN_ICONS[address.toLowerCase()];
  return ext ? \`/token-icons/\${address.toLowerCase()}.\${ext}\` : null;
}
`;
  writeFileSync(MANIFEST_PATH, body);
}

async function collectTargetAddresses(): Promise<Set<string>> {
  const targets = new Set<string>();

  for (const address of PORTAL_PERMIT2_TOKEN_ADDRESSES) {
    targets.add(address.toLowerCase());
  }

  const wallet = process.argv.find((arg) => /^0x[0-9a-fA-F]{40}$/.test(arg));
  if (wallet) {
    const { fetchAllWalletTokens } = await import('../src/lib/tokens');
    const holdings = await fetchAllWalletTokens(wallet, {
      enrichMetadata: false,
    });
    for (const token of holdings) {
      targets.add(token.address.toLowerCase());
    }
  }

  return targets;
}

async function main() {
  loadEnvLocal();
  mkdirSync(ICONS_DIR, { recursive: true });

  const force = process.argv.includes('--force');
  const covered = force ? new Map<string, string>() : readCoveredAddresses();
  const targets = await collectTargetAddresses();

  const todo = [...targets].filter((address) => !covered.has(address));

  console.log(
    `Target addresses: ${targets.size} · already covered: ${covered.size} · to download: ${todo.length}`,
  );

  let downloaded = 0;
  let missed = 0;
  for (const address of todo) {
    const sources = await resolveIconSources(address);
    let saved: string | null = null;
    for (const url of sources) {
      saved = await downloadImage(url, address);
      if (saved) break;
    }

    if (saved) {
      downloaded += 1;
      const ext = extname(saved).replace(/^\./, '').toLowerCase();
      covered.set(address, ext);
      console.log(`  OK  ${address} -> ${basename(saved)}`);
    } else {
      missed += 1;
      console.log(`  --  ${address} (no icon)`);
    }

    // Keep well under GeckoTerminal's 30 req/min public rate limit.
    await new Promise((r) => setTimeout(r, 2200));
  }

  writeManifest(covered);
  console.log(
    `\nDone. Downloaded ${downloaded}, missed ${missed}. Manifest covers ${covered.size} addresses.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
