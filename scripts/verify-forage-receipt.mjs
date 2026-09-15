/**
 * Verifies the forage-events receipt parsing against a real World Chain tx.
 * Mirrors src/lib/forage-verify.ts: fetch the receipt, extract WLD Transfer
 * logs, and summarize fee vs. user proceeds (handling the self-transfer edge
 * case when the fee wallet IS the user wallet).
 *
 * Usage: node scripts/verify-forage-receipt.mjs <txHash> <userWallet> [feeWallet]
 */
import {
  createPublicClient,
  http,
  formatUnits,
  getAddress,
  parseAbiItem,
  parseEventLogs,
} from 'viem';
import { worldchain } from 'viem/chains';
import { readFileSync } from 'node:fs';

function loadEnvValue(name) {
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = env.match(new RegExp(`${name}="?([^"\\r\\n]+)"?`));
    if (m) return m[1];
  } catch {}
  return undefined;
}

const apiKey = process.env.ALCHEMY_API_KEY ?? loadEnvValue('ALCHEMY_API_KEY');
const RPC =
  apiKey
    ? `https://worldchain-mainnet.g.alchemy.com/v2/${apiKey}`
    : process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL ??
      loadEnvValue('NEXT_PUBLIC_WORLDCHAIN_RPC_URL') ??
      loadEnvValue('WORLDCHAIN_TENDERLY_RPC_URL') ??
      'https://worldchain-mainnet.gateway.tenderly.co';

const WLD = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';

const txHash =
  process.argv[2] ??
  '0x1a9c23b8fb3efe8adb025ec498ace17594899ebc42f295c5dde9b7f179ef1f4f';
const userWallet = getAddress(
  process.argv[3] ?? '0xE91A0B039159D3a50e65d337255FE0169B548260',
);
const feeWallet = getAddress(
  process.argv[4] ??
    loadEnvValue('NEXT_PUBLIC_PLATFORM_FEE_WALLET') ??
    userWallet,
);

const client = createPublicClient({ chain: worldchain, transport: http(RPC) });

const receipt = await client.getTransactionReceipt({ hash: txHash });
console.log(`tx ${txHash}`);
console.log(`status: ${receipt.status}, logs: ${receipt.logs.length}`);

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const wldLogs = receipt.logs.filter(
  (log) => log.address.toLowerCase() === WLD.toLowerCase(),
);
const transfers = parseEventLogs({
  abi: [transferEvent],
  eventName: 'Transfer',
  logs: wldLogs,
}).map((log) => ({ from: log.args.from, to: log.args.to, value: log.args.value }));

console.log(`WLD transfers: ${transfers.length}`);
for (const t of transfers) {
  console.log(`  ${t.from} -> ${t.to}: ${formatUnits(t.value, 18)} WLD`);
}

// Same summary rules as summarizeWldTransfers in src/lib/forage-verify.ts
const user = userWallet.toLowerCase();
const fee = feeWallet.toLowerCase();
let received = 0n;
let feePaid = 0n;
let swaps = 0;

for (const t of transfers) {
  const from = t.from.toLowerCase();
  const to = t.to.toLowerCase();
  if (to === fee && from === user) {
    feePaid += t.value;
    continue;
  }
  if (to === user && from !== user) {
    received += t.value;
    swaps += 1;
  }
}

console.log('--- summary ---');
console.log(`user wallet:     ${userWallet}`);
console.log(`fee wallet:      ${feeWallet}${fee === user ? ' (== user wallet, self-transfer fee)' : ''}`);
console.log(`swap payouts:    ${swaps}`);
console.log(`user received:   ${formatUnits(received, 18)} WLD`);
console.log(`platform fee:    ${formatUnits(feePaid, 18)} WLD`);

if (receipt.status !== 'success') {
  console.log('RESULT: FAIL (tx not successful)');
  process.exit(1);
}
if (feePaid <= 0n) {
  console.log('RESULT: FAIL (no fee transfer found)');
  process.exit(1);
}
if (received <= 0n) {
  console.log('RESULT: FAIL (no swap proceeds for user)');
  process.exit(1);
}
console.log('RESULT: PASS');
