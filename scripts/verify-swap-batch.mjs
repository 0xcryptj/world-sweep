/**
 * End-to-end verification of the sweep batch against World Chain mainnet.
 * Builds approve + swap calldata exactly like the app and simulates the batch
 * sequentially (with state carryover) via alchemy_simulateExecutionBundle.
 *
 * Usage: node scripts/verify-swap-batch.mjs <walletAddress> [v1|v2]
 *   v2 (default) = SwapRouter02 ABI (no deadline)
 *   v1           = legacy SwapRouter ABI (with deadline) — the old, broken encoding
 */
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  formatUnits,
  getAddress,
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

function loadEnvRpc() {
  // Prefer the keyed Alchemy endpoint (higher rate limits, supports
  // alchemy_simulateExecutionBundle) built from the server-side key.
  const apiKey = process.env.ALCHEMY_API_KEY ?? loadEnvValue('ALCHEMY_API_KEY');
  if (apiKey) {
    return `https://worldchain-mainnet.g.alchemy.com/v2/${apiKey}`;
  }
  return (
    process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL ??
    loadEnvValue('NEXT_PUBLIC_WORLDCHAIN_RPC_URL') ??
    'https://worldchain-mainnet.g.alchemy.com/public'
  );
}

const RPC = loadEnvRpc();
const ROUTER = '0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6';
const QUOTER = '0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c';
const WLD = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';
const FEE_TIERS = [500, 3000, 10000];

const erc20 = parseAbi([
  'function approve(address,uint256) returns (bool)',
]);

const quoterV2 = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);

const swapRouter02 = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

const swapRouterV1 = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

const wallet = getAddress(process.argv[2] ?? '0xe91a0b039159d3a50e65d337255fe0169b548260');
const abiVariant = process.argv[3] === 'v1' ? 'v1' : 'v2';
const client = createPublicClient({ chain: worldchain, transport: http(RPC) });

async function findTokens() {
  try {
    const res = await fetch(`https://forag3r.app/world/api/tokens?address=${wallet}`);
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body.tokens) && body.tokens.length) return body.tokens;
    }
  } catch {}
  return [];
}

function encodeSwap(token, fee, amountIn, minOut) {
  if (abiVariant === 'v1') {
    return encodeFunctionData({
      abi: swapRouterV1,
      functionName: 'exactInputSingle',
      args: [{ tokenIn: token, tokenOut: WLD, fee, recipient: wallet, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
    });
  }
  return encodeFunctionData({
    abi: swapRouter02,
    functionName: 'exactInputSingle',
    args: [{ tokenIn: token, tokenOut: WLD, fee, recipient: wallet, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
  });
}

const tokens = await findTokens();
console.log(`Wallet ${wallet}: ${tokens.length} junk tokens from app API (ABI: ${abiVariant})`);

let tested = 0;
for (const t of tokens) {
  if (tested >= 4) break;
  const token = getAddress(t.address);
  const balance = BigInt(t.balance);
  if (balance <= 0n) continue;

  let best = null;
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await client.simulateContract({
        address: QUOTER,
        abi: quoterV2,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: token, tokenOut: WLD, amountIn: balance, fee, sqrtPriceLimitX96: 0n }],
      });
      const out = result[0];
      if (!best || out > best.out) best = { fee, out };
    } catch {}
  }
  if (!best) {
    console.log(`- ${t.symbol} (${token}): no direct WLD route, skipping`);
    continue;
  }

  const minOut = (best.out * 9700n) / 10000n;
  const approveData = encodeFunctionData({ abi: erc20, functionName: 'approve', args: [ROUTER, balance] });
  const swapData = encodeSwap(token, best.fee, balance, minOut);

  try {
    // eth_simulateV1 executes the calls sequentially with state carryover
    // (the approve is applied before the swap), which is the atomic-batch
    // behaviour we need. alchemy_simulateExecutionBundle was retired on
    // World Chain, so this is the supported equivalent.
    const [block] = await client.request({
      method: 'eth_simulateV1',
      params: [
        {
          blockStateCalls: [
            {
              calls: [
                { from: wallet, to: token, data: approveData, value: '0x0' },
                { from: wallet, to: ROUTER, data: swapData, value: '0x0' },
              ],
            },
          ],
          traceTransfers: false,
          validation: false,
        },
        'latest',
      ],
    });

    const calls = block?.calls ?? [];
    const errors = calls
      .map((c, i) => ({ i, status: c.status, err: c.error }))
      .filter((c) => c.status !== '0x1');

    if (calls.length === 2 && errors.length === 0) {
      console.log(`- ${t.symbol} (${token}) fee=${best.fee}: batch SUCCESS -> quoted ${formatUnits(best.out, 18)} WLD`);
    } else {
      console.log(`- ${t.symbol} (${token}) fee=${best.fee}: batch FAILED`);
      for (const { i, err } of errors) {
        console.log(`  call ${i} (${i === 0 ? 'approve' : 'swap'}) revert:`, err?.message ?? JSON.stringify(err));
      }
    }
  } catch (e) {
    console.log(`- ${t.symbol}: bundle simulation threw:`, e.shortMessage ?? e.message);
  }
  tested++;
}

if (tested === 0) console.log('No tokens tested — check wallet address or API.');
