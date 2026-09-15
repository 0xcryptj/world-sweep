'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { AnimatedWld } from '@/components/Sweep/AnimatedWld';
import { apiPath } from '@/lib/base-path';
import {
  PLATFORM_FEE_BPS,
  WLD_ADDRESS,
  WORLD_CHAIN_ID,
} from '@/lib/constants';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import { sendMiniKitTransaction } from '@/lib/minikit-transaction';
import type { BuildSweepResponse, WalletToken } from '@/lib/types';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { erc20Abi } from '@/lib/abis';
import { encodeFunctionData, isAddress, parseUnits } from 'viem';
import { useMemo, useState } from 'react';

type Sheet = 'send' | 'receive' | 'swap' | null;

type WalletActionsProps = {
  walletAddress: string;
  wldBalance: string;
  tokens: WalletToken[];
  forageableTokens: WalletToken[];
};

const feePercent = PLATFORM_FEE_BPS / 100;

function qrSrc(address: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=ffffff&bgcolor=111111&data=${encodeURIComponent(address)}`;
}

export function WalletActions({
  walletAddress,
  wldBalance,
  tokens,
  forageableTokens,
}: WalletActionsProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sendToken, setSendToken] = useState<string>(WLD_ADDRESS);
  const [sendAmount, setSendAmount] = useState('');
  const [sendTo, setSendTo] = useState('');

  const [swapToken, setSwapToken] = useState<string>(
    forageableTokens[0]?.address ?? '',
  );
  const [swapPlan, setSwapPlan] = useState<BuildSweepResponse | null>(null);

  const sendChoices = useMemo(() => {
    const wld = tokens.find(
      (token) => token.address.toLowerCase() === WLD_ADDRESS.toLowerCase(),
    );
    const rest = tokens.filter(
      (token) => token.address.toLowerCase() !== WLD_ADDRESS.toLowerCase(),
    );
    if (wld) {
      return [wld, ...rest];
    }
    return [
      {
        address: WLD_ADDRESS,
        symbol: 'WLD',
        name: 'Worldcoin',
        decimals: 18,
        balance: '0',
        balanceFormatted: wldBalance,
      } satisfies WalletToken,
      ...rest,
    ];
  }, [tokens, wldBalance]);

  const activeSend = sendChoices.find(
    (token) => token.address.toLowerCase() === sendToken.toLowerCase(),
  );
  const activeSwap =
    forageableTokens.find(
      (token) => token.address.toLowerCase() === swapToken.toLowerCase(),
    ) ?? forageableTokens[0];

  const open = (next: Sheet) => {
    void hapticSelection();
    setError(null);
    setSwapPlan(null);
    setSheet(next);
    if (next === 'swap' && forageableTokens[0]) {
      setSwapToken(forageableTokens[0].address);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      void hapticNotification('success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      void hapticNotification('error');
    }
  };

  const send = async () => {
    if (!activeSend) {
      return;
    }
    if (!isAddress(sendTo)) {
      setError('Enter a valid World Chain address.');
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(sendAmount.trim(), activeSend.decimals || 18);
    } catch {
      setError('Enter a valid amount.');
      return;
    }
    if (amount <= BigInt(0)) {
      setError('Amount must be greater than zero.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      void hapticImpact('medium');
      await sendMiniKitTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [
          {
            to: activeSend.address as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [sendTo as `0x${string}`, amount],
            }),
            value: '0x0',
          },
        ],
      });
      void hapticNotification('success');
      setSheet(null);
      setSendAmount('');
      requestWalletRefresh({ reason: 'manual', force: true });
    } catch (sendError) {
      void hapticNotification('error');
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Send failed. Try again in World App.',
      );
    } finally {
      setBusy(false);
    }
  };

  const quoteSwap = async (token: WalletToken) => {
    setBusy(true);
    setError(null);
    setSwapPlan(null);
    try {
      const response = await fetchWithTimeout(
        apiPath('/build-sweep'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            tokens: [token],
          }),
        },
        40_000,
      );
      const payload = (await response.json()) as BuildSweepResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not quote this swap.');
      }
      if (payload.quotes.length === 0) {
        throw new Error(
          payload.skippedTokens[0]?.reason ??
            'No WLD route for this token right now.',
        );
      }
      setSwapPlan(payload);
    } catch (quoteError) {
      setError(
        quoteError instanceof Error
          ? quoteError.message
          : 'Could not quote this swap.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmSwap = async () => {
    if (!swapPlan || swapPlan.transactions.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      void hapticImpact('medium');
      await sendMiniKitTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: swapPlan.transactions,
      });
      void hapticNotification('success');
      setSheet(null);
      setSwapPlan(null);
      requestWalletRefresh({ reason: 'forage', force: true });
    } catch (swapError) {
      void hapticNotification('error');
      setError(
        swapError instanceof Error
          ? swapError.message
          : 'Swap failed. Try again in World App.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="forager-wallet-actions">
        <ForagerButton variant="secondary" size="sm" onClick={() => open('send')}>
          Send
        </ForagerButton>
        <ForagerButton
          variant="secondary"
          size="sm"
          onClick={() => open('receive')}
        >
          Receive
        </ForagerButton>
        <ForagerButton variant="secondary" size="sm" onClick={() => open('swap')}>
          Swap
        </ForagerButton>
      </div>

      {sheet ? (
        <div className="forager-sheet" role="dialog" aria-modal>
          <div className="forager-sheet-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="forager-title text-[17px] capitalize">{sheet}</p>
              <button
                type="button"
                className="forager-text-action"
                onClick={() => setSheet(null)}
              >
                Close
              </button>
            </div>

            {sheet === 'receive' ? (
              <div className="flex flex-col items-center gap-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc(walletAddress)}
                  alt="Wallet QR code"
                  width={200}
                  height={200}
                  className="rounded-[14px] border border-white/10"
                />
                <p className="break-all text-[13px] text-forager-text-muted">
                  {walletAddress}
                </p>
                <ForagerButton size="md" className="w-full" onClick={() => void copyAddress()}>
                  {copied ? 'Copied' : 'Copy address'}
                </ForagerButton>
              </div>
            ) : null}

            {sheet === 'send' ? (
              <div className="space-y-3">
                <label className="block text-[13px] text-forager-text-muted">
                  Token
                  <select
                    className="forager-field mt-1"
                    value={sendToken}
                    onChange={(event) => setSendToken(event.target.value)}
                  >
                    {sendChoices.map((token) => (
                      <option key={token.address} value={token.address}>
                        {token.symbol} · {token.balanceFormatted}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[13px] text-forager-text-muted">
                  Amount
                  <input
                    className="forager-field mt-1"
                    inputMode="decimal"
                    value={sendAmount}
                    onChange={(event) => setSendAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label className="block text-[13px] text-forager-text-muted">
                  To
                  <input
                    className="forager-field mt-1"
                    value={sendTo}
                    onChange={(event) => setSendTo(event.target.value)}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <ForagerButton
                  size="md"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? 'Opening World App…' : `Send ${activeSend?.symbol ?? ''}`}
                </ForagerButton>
              </div>
            ) : null}

            {sheet === 'swap' ? (
              <div className="space-y-3">
                {forageableTokens.length === 0 ? (
                  <p className="forager-subtitle text-[15px] leading-snug">
                    No forageable leftover tokens right now. Scan on Home first,
                    then swap to WLD here. A {feePercent}% platform fee applies.
                  </p>
                ) : (
                  <>
                    <label className="block text-[13px] text-forager-text-muted">
                      From
                      <select
                        className="forager-field mt-1"
                        value={activeSwap?.address ?? ''}
                        onChange={(event) => {
                          setSwapToken(event.target.value);
                          setSwapPlan(null);
                        }}
                      >
                        {forageableTokens.map((token) => (
                          <option key={token.address} value={token.address}>
                            {token.symbol} · {token.balanceFormatted}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[13px] text-forager-text-muted">
                      Swaps leftover tokens to WLD. {feePercent}% platform fee
                      is taken from the quoted output.
                    </p>
                    {activeSwap ? (
                      <div className="flex items-center gap-3 rounded-[12px] bg-white/5 px-3 py-2">
                        <TokenIcon
                          address={activeSwap.address}
                          symbol={activeSwap.symbol}
                          logoUrl={activeSwap.logoUrl}
                          size="sm"
                        />
                        <p className="text-[15px]">To WLD</p>
                      </div>
                    ) : null}
                    {swapPlan ? (
                      <div className="space-y-1">
                        <p className="text-[13px] text-forager-text-muted">
                          You receive after {feePercent}% fee
                        </p>
                        <AnimatedWld
                          amountWei={swapPlan.userReceivesWld}
                          className="forager-value-green text-[22px] font-semibold"
                        />
                      </div>
                    ) : null}
                    <ForagerButton
                      size="md"
                      className="w-full"
                      disabled={busy || !activeSwap}
                      onClick={() => {
                        if (swapPlan) {
                          void confirmSwap();
                          return;
                        }
                        if (activeSwap) {
                          void quoteSwap(activeSwap);
                        }
                      }}
                    >
                      {busy
                        ? 'Working…'
                        : swapPlan
                          ? 'Swap in World App'
                          : 'Preview swap'}
                    </ForagerButton>
                  </>
                )}
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-[13px] leading-snug text-red-300">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
