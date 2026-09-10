import {
  concat,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  keccak256,
  maxUint256,
  pad,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { erc20Abi, swapRouterAbi } from './abis';
import { UNISWAP_V3_SWAP_ROUTER } from './constants';
import { encodeV3Path, type RouteQuote } from './swap-quotes';
import { publicClient } from './tokens';

const ALLOWANCE_SLOT_CANDIDATES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function transferErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 160);
  }
  return 'Token transfer to router failed';
}

/**
 * Fast scan/build gate: wallet → Uniswap router `transfer` must succeed.
 * Prefer this during liquidity scans — the full sell-safety probe below is too
 * RPC-heavy for the wallet scan budget.
 */
export async function checkRouterTransferability(
  token: Address,
  amount: bigint,
  account: Address,
): Promise<string | null> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [UNISWAP_V3_SWAP_ROUTER, amount],
  });

  try {
    const simulation = await publicClient.call({
      account,
      to: token,
      data,
    });

    if (simulation.data && simulation.data !== '0x') {
      try {
        const canTransfer = decodeFunctionResult({
          abi: erc20Abi,
          functionName: 'transfer',
          data: simulation.data,
        });

        if (canTransfer === false) {
          return 'Token transfer() returned false';
        }
      } catch (decodeError) {
        if (
          decodeError instanceof Error &&
          decodeError.message.includes('returned false')
        ) {
          return decodeError.message.slice(0, 160);
        }
      }
    }
  } catch (error) {
    return transferErrorMessage(error);
  }

  return null;
}

function allowanceStorageSlot(
  owner: Address,
  spender: Address,
  mappingSlot: number,
): Hex {
  const ownerSlot = keccak256(
    concat([pad(owner, { size: 32 }), pad(toHex(mappingSlot), { size: 32 })]),
  );
  return keccak256(concat([pad(spender, { size: 32 }), ownerSlot]));
}

async function ethCallWithAllowanceOverride({
  from,
  to,
  data,
  token,
  owner,
  spender,
}: {
  from: Address;
  to: Address;
  data: Hex;
  token: Address;
  owner: Address;
  spender: Address;
}): Promise<boolean> {
  for (const slotIndex of ALLOWANCE_SLOT_CANDIDATES) {
    const slot = allowanceStorageSlot(owner, spender, slotIndex);
    try {
      await publicClient.request({
        method: 'eth_call',
        params: [
          { from, to, data },
          'latest',
          {
            [token]: {
              stateDiff: {
                [slot]: toHex(maxUint256, { size: 32 }),
              },
            },
          },
        ],
      });
      return true;
    } catch {
      // Wrong slot or honeypot — try next slot.
    }
  }

  return false;
}

/**
 * Stronger honeypot / unsafe-token probe for build-time use:
 * 1) wallet → router `transfer` must succeed
 * 2) router `transferFrom` must succeed under an allowance state override
 * 3) router swap calldata for the quoted route must succeed under the same override
 *
 * Do not call this from the wallet liquidity scan — use
 * `checkRouterTransferability` there so scans finish within the API budget.
 *
 * Returns a short reason when the token should stay non-foragable, else null.
 */
export async function checkTokenSellSafety({
  token,
  amount,
  account,
  route,
}: {
  token: Address;
  amount: bigint;
  account: Address;
  route: RouteQuote;
}): Promise<string | null> {
  const tokenAddress = getAddress(token);
  const wallet = getAddress(account);
  const router = getAddress(UNISWAP_V3_SWAP_ROUTER);

  try {
    await publicClient.call({
      account: wallet,
      to: tokenAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [router, amount],
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Token transfer to router failed';
    return message.slice(0, 160);
  }

  const transferFromOk = await ethCallWithAllowanceOverride({
    from: router,
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transferFrom',
      args: [wallet, router, amount],
    }),
    token: tokenAddress,
    owner: wallet,
    spender: router,
  });

  if (!transferFromOk) {
    return 'Unsafe sell path — transferFrom blocked (possible honeypot)';
  }

  const swapData =
    route.hops.length === 1
      ? encodeFunctionData({
          abi: swapRouterAbi,
          functionName: 'exactInputSingle',
          args: [
            {
              tokenIn: route.hops[0].tokenIn,
              tokenOut: route.hops[0].tokenOut,
              fee: route.hops[0].fee,
              recipient: wallet,
              amountIn: amount,
              amountOutMinimum: BigInt(0),
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        })
      : encodeFunctionData({
          abi: swapRouterAbi,
          functionName: 'exactInput',
          args: [
            {
              path: encodeV3Path(route.hops),
              recipient: wallet,
              amountIn: amount,
              amountOutMinimum: BigInt(0),
            },
          ],
        });

  const swapOk = await ethCallWithAllowanceOverride({
    from: wallet,
    to: router,
    data: swapData,
    token: tokenAddress,
    owner: wallet,
    spender: router,
  });

  if (!swapOk) {
    return 'Unsafe sell path — swap simulation failed (possible honeypot)';
  }

  return null;
}
