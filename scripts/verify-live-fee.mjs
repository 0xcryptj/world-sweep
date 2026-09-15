/**
 * Live check of the production /api/build-sweep fee math:
 * platformFeeWld must equal PLATFORM_FEE_BPS (5%) of the sum of the *quoted*
 * outputs, and the final transaction must be the WLD transfer of exactly that
 * amount to the platform fee wallet.
 *
 * Usage: node scripts/verify-live-fee.mjs [walletAddress]
 */
import { decodeFunctionData, formatUnits, getAddress, parseAbi } from 'viem';

const BASE = 'https://forag3r.app/world/api';
const WLD = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';
const FEE_WALLET = '0xE91A0B039159D3a50e65d337255FE0169B548260';
const FEE_BPS = 500n;

const wallet = getAddress(
  process.argv[2] ?? '0xE91A0B039159D3a50e65d337255FE0169B548260',
);

const erc20 = parseAbi(['function transfer(address,uint256) returns (bool)']);

const tokensRes = await fetch(`${BASE}/tokens?address=${wallet}`);
const { tokens } = await tokensRes.json();
console.log(`tokens: ${tokens?.length ?? 0}`);
if (!tokens?.length) {
  console.log('RESULT: SKIP (no junk tokens in wallet)');
  process.exit(0);
}

const res = await fetch(`${BASE}/build-sweep`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress: wallet, tokens }),
});
const plan = await res.json();
if (!res.ok) {
  console.log('build-sweep error:', plan.error);
  process.exit(1);
}

const quotedSum = plan.quotes.reduce(
  (sum, q) => sum + BigInt(q.estimatedWldOut),
  0n,
);
const minSum = plan.quotes.reduce((sum, q) => sum + BigInt(q.minWldOut), 0n);
const expectedFee = (quotedSum * FEE_BPS) / 10000n;

console.log(`quotes: ${plan.quotes.length}, txs: ${plan.transactions.length}`);
console.log(`sum(quoted amountOut): ${formatUnits(quotedSum, 18)} WLD`);
console.log(`sum(minWldOut):        ${formatUnits(minSum, 18)} WLD (estimatedWldTotal=${formatUnits(BigInt(plan.estimatedWldTotal), 18)})`);
console.log(`platformFeeWld:        ${formatUnits(BigInt(plan.platformFeeWld), 18)} WLD`);
console.log(`expected 5% of quotes: ${formatUnits(expectedFee, 18)} WLD`);
console.log(`userReceivesWld:       ${formatUnits(BigInt(plan.userReceivesWld), 18)} WLD`);

let ok = true;
if (BigInt(plan.platformFeeWld) !== expectedFee) {
  console.log('FAIL: platformFeeWld != 5% of quoted sum');
  ok = false;
}
if (BigInt(plan.estimatedWldTotal) !== minSum) {
  console.log('FAIL: estimatedWldTotal != sum(minWldOut)');
  ok = false;
}
if (
  BigInt(plan.userReceivesWld) !==
  BigInt(plan.estimatedWldTotal) - BigInt(plan.platformFeeWld)
) {
  console.log('FAIL: userReceivesWld != estimatedWldTotal - platformFeeWld');
  ok = false;
}

const last = plan.transactions[plan.transactions.length - 1];
if (getAddress(last.to) !== getAddress(WLD)) {
  console.log('FAIL: last tx is not a WLD call');
  ok = false;
} else {
  const decoded = decodeFunctionData({ abi: erc20, data: last.data });
  const [to, amount] = decoded.args;
  console.log(`last tx: WLD.${decoded.functionName}(${to}, ${formatUnits(amount, 18)} WLD)`);
  if (decoded.functionName !== 'transfer') {
    console.log('FAIL: last tx is not transfer()');
    ok = false;
  }
  if (getAddress(to) !== getAddress(FEE_WALLET)) {
    console.log('FAIL: fee recipient mismatch');
    ok = false;
  }
  if (amount !== expectedFee) {
    console.log('FAIL: on-chain fee amount != expected 5% of quotes');
    ok = false;
  }
}

console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
