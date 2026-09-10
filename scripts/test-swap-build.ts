import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const { buildSweepPlan } = await import('../src/lib/sweep');
const { scanWalletForForage } = await import('../src/lib/forage-scan');
const { fetchWalletTokens } = await import('../src/lib/tokens');

const wallet = process.argv[2] ?? '0xe91a0b039159d3a50e65d337255fe0169b548260';
const tokens = await fetchWalletTokens(wallet);
const { swappable } = await scanWalletForForage(tokens, wallet);

console.log('swappable:', swappable.length);

if (swappable.length === 0) {
  process.exit(0);
}

const plan = await buildSweepPlan({
  walletAddress: wallet,
  tokens: swappable.slice(0, 2),
});

console.log(
  JSON.stringify(
    {
      quotes: plan.quotes.length,
      transactions: plan.transactions.length,
      platformFeeWld: plan.platformFeeWld,
      sampleQuote: plan.quotes[0],
    },
    null,
    2,
  ),
);
