'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { FeeFootnote } from '@/components/FeeFootnote';
import { IosIcon } from '@/components/IosIcon';
import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { AnimatedWld } from '@/components/Sweep/AnimatedWld';
import { apiPath } from '@/lib/base-path';
import {
  WLD_ADDRESS,
  WORLD_CHAIN_ID,
} from '@/lib/constants';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import { sendMiniKitTransaction } from '@/lib/minikit-transaction';
import { getTokenExclusionReason } from '@/lib/token-filters';
import type { BuildSweepResponse, WalletToken } from '@/lib/types';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { erc20Abi } from '@/lib/abis';
import { encodeFunctionData, isAddress, parseUnits } from 'viem';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Sheet = 'send' | 'receive' | 'swap' | null;

type WalletActionsProps = {
  walletAddress: string;
  wldBalance: string;
  tokens: WalletToken[];
  forageableTokens: WalletToken[];
};

function qrSrc(address: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&qzone=2&ecc=M&color=000000&bgcolor=ffffff&format=png&data=${encodeURIComponent(address)}`;
}

function TokenPickRow({
  token,
  selected,
  onSelect,
}: {
  token: WalletToken;
  selected: boolean;
  onSelect: (address: string) => void;
}) {
  return (
    <button
      type="button"
      className={`forager-token-pick${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(token.address)}
    >
      <TokenIcon
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        size="sm"
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px] font-medium">
          {token.symbol}
        </span>
        <span className="block truncate text-[12px] text-forager-text-muted">
          {token.balanceFormatted}
        </span>
      </span>
      {selected ? <IosIcon name="check" size={16} /> : null}
    </button>
  );
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
    const rest = tokens.filter((token) => {
      if (token.address.toLowerCase() === WLD_ADDRESS.toLowerCase()) {
        return false;
      }
      const reason = getTokenExclusionReason(token);
      return reason !== 'protected' && reason !== 'staked_re';
    });
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

  const swapChoices = useMemo(() => {
    const fromForageable = forageableTokens.filter(
      (token) => token.address.toLowerCase() !== WLD_ADDRESS.toLowerCase(),
    );
    if (fromForageable.length > 0) {
      return fromForageable;
    }
    return tokens.filter((token) => {
      if (token.address.toLowerCase() === WLD_ADDRESS.toLowerCase()) {
        return false;
      }
      const reason = getTokenExclusionReason(token);
      return (
        reason !== 'protected' &&
        reason !== 'staked_re' &&
        reason !== 'malicious' &&
        reason !== 'zero_balance'
      );
    });
  }, [forageableTokens, tokens]);

  const activeSend = sendChoices.find(
    (token) => token.address.toLowerCase() === sendToken.toLowerCase(),
  );
  const activeSwap =
    swapChoices.find(
      (token) => token.address.toLowerCase() === swapToken.toLowerCase(),
    ) ?? swapChoices[0];

  const open = (next: Sheet) => {
    void hapticSelection();
    setError(null);
    setSwapPlan(null);
    setSheet(next);
    if (next === 'swap' && swapChoices[0]) {
      setSwapToken(swapChoices[0].address);
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
            'Unable to find route for this token right now.',
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

  const sheetTitle =
    sheet === 'send' ? 'Send' : sheet === 'receive' ? 'Receive' : 'Swap to WLD';

  const sheetCard =
    sheet && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="forager-sheet"
            role="dialog"
            aria-modal
            aria-label={sheetTitle}
            onClick={() => setSheet(null)}
          >
            <div
              className="forager-sheet-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="forager-title text-[17px]">{sheetTitle}</p>
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
                  <div className="forager-qr-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrSrc(walletAddress)}
                      alt="Wallet QR code"
                      width={280}
                      height={280}
                    />
                  </div>
                  <p className="break-all text-[13px] leading-snug text-forager-text-muted">
                    {walletAddress}
                  </p>
                  <ForagerButton
                    size="md"
                    className="w-full"
                    onClick={() => void copyAddress()}
                  >
                    {copied ? 'Copied' : 'Copy address'}
                  </ForagerButton>
                </div>
              ) : null}

              {sheet === 'send' ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-forager-text-muted">Token</p>
                  <div className="forager-token-pick-list">
                    {sendChoices.map((token) => (
                      <TokenPickRow
                        key={token.address}
                        token={token}
                        selected={
                          token.address.toLowerCase() === sendToken.toLowerCase()
                        }
                        onSelect={(address) => setSendToken(address)}
                      />
                    ))}
                  </div>
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
                    {busy
                      ? 'Opening World App…'
                      : `Send ${activeSend?.symbol ?? ''}`}
                  </ForagerButton>
                </div>
              ) : null}

              {sheet === 'swap' ? (
                <div className="space-y-3">
                  {swapChoices.length === 0 ? (
                    <p className="forager-subtitle text-[15px] leading-snug">
                      No leftover tokens to swap right now. Scan on Home first.
                    </p>
                  ) : (
                    <>
                      <p className="text-[13px] text-forager-text-muted">From</p>
                      <div className="forager-token-pick-list">
                        {swapChoices.map((token) => (
                          <TokenPickRow
                            key={token.address}
                            token={token}
                            selected={
                              token.address.toLowerCase() ===
                              (activeSwap?.address ?? '').toLowerCase()
                            }
                            onSelect={(address) => {
                              setSwapToken(address);
                              setSwapPlan(null);
                              setError(null);
                            }}
                          />
                        ))}
                      </div>
                      {activeSwap ? (
                        <div className="flex items-center gap-3 rounded-[12px] bg-white/5 px-3 py-2">
                          <TokenIcon
                            address={WLD_ADDRESS}
                            symbol="WLD"
                            size="sm"
                          />
                          <p className="text-[15px]">To WLD via Uniswap</p>
                        </div>
                      ) : null}
                      {swapPlan ? (
                        <div className="space-y-1">
                          <p className="text-[13px] text-forager-text-muted">
                            You receive
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
                          ? swapPlan
                            ? 'Opening World App…'
                            : 'Quoting Uniswap…'
                          : swapPlan
                            ? 'Swap in World App'
                            : 'Preview swap'}
                      </ForagerButton>
                      <FeeFootnote />
                    </>
                  )}
                </div>
              ) : null}

              {error ? (
                <p className="mt-3 text-[13px] leading-snug text-red-300">
                  {error}
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="forager-wallet-actions">
        <button
          type="button"
          className="forager-wallet-action"
          onClick={() => open('send')}
        >
          <span className="forager-wallet-action-icon">
            <IosIcon name="send" size={22} />
          </span>
          Send
        </button>
        <button
          type="button"
          className="forager-wallet-action"
          onClick={() => open('receive')}
        >
          <span className="forager-wallet-action-icon">
            <IosIcon name="receive" size={22} />
          </span>
          Receive
        </button>
        <button
          type="button"
          className="forager-wallet-action"
          onClick={() => open('swap')}
        >
          <span className="forager-wallet-action-icon">
            <IosIcon name="swap" size={22} />
          </span>
          Swap
        </button>
      </div>
      {sheetCard}
    </>
  );
}
