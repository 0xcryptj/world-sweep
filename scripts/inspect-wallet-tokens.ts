import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isForageableToken, isStakedYieldToken } from '../src/lib/token-filters';
import { fetchAllWalletTokens } from '../src/lib/tokens';

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const contents = readFileSync(envPath, 'utf8');
    for (const line of contents.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local optional for scripts run inside Next
  }
}

loadEnvLocal();

const wallet = process.argv[2] ?? '0xe91a0b039159d3a50e65d337255fe0169b548260';

const all = await fetchAllWalletTokens(wallet);
const re = all.filter((t) => isStakedYieldToken(t.symbol, t.name));
const forage = all.filter(isForageableToken);

console.log({ all: all.length, re: re.length, forage: forage.length });
re.forEach((t) => console.log('RE:', t.symbol, t.name, t.address));

const maybeRe = all.filter(
  (t) =>
    /re/i.test(`${t.symbol} ${t.name}`) &&
    !isStakedYieldToken(t.symbol, t.name),
);
maybeRe.forEach((t) => console.log('maybe-re?', t.symbol, t.name, t.address));
