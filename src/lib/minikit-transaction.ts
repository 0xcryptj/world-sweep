import { MiniKit } from '@worldcoin/minikit-js';
import { withTimeout } from '@/lib/fetch-with-timeout';

type MiniKitResponseEvent = Parameters<typeof MiniKit.subscribe>[0];

const SEND_TRANSACTION_EVENT =
  'miniapp-send-transaction' as MiniKitResponseEvent;

type SendTransactionOptions = Parameters<typeof MiniKit.sendTransaction>[0];
type SendTransactionResult = Awaited<ReturnType<typeof MiniKit.sendTransaction>>;

const DEFAULT_SEND_TIMEOUT_MS = 90_000;

/**
 * MiniKit unsubscribes after each sendTransaction response. World App can post
 * a duplicate event on cancel/error, which logs "No handler for event…".
 * Restore a no-op handler so those late events are absorbed quietly.
 */
export function restoreSendTransactionEventHandler(): void {
  MiniKit.subscribe(SEND_TRANSACTION_EVENT, () => {
    // Intentionally empty — drains duplicate postMessage events.
  });
}

function asErrorPayload(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const envelope = result as {
    status?: string;
    error_code?: string;
    code?: string;
    details?: unknown;
    data?: {
      status?: string;
      error_code?: string;
      code?: string;
      details?: unknown;
      userOpHash?: string;
    };
  };

  const data = envelope.data;
  if (data?.status === 'error' || envelope.status === 'error') {
    return {
      status: 'error',
      error_code: data?.error_code ?? data?.code ?? envelope.error_code ?? envelope.code,
      details: data?.details ?? envelope.details,
      data,
    };
  }

  return null;
}

export async function sendMiniKitTransaction(
  options: SendTransactionOptions,
  timeoutMs = DEFAULT_SEND_TIMEOUT_MS,
): Promise<SendTransactionResult> {
  try {
    const result = await withTimeout(
      MiniKit.sendTransaction({
        chainId: options.chainId,
        transactions: options.transactions.map((tx) => ({
          to: tx.to,
          data: tx.data,
          value: tx.value && tx.value !== '' ? tx.value : '0x0',
        })),
      }),
      timeoutMs,
      'World App did not respond in time. Close and reopen World App, then retry forage.',
    );

    const errorPayload = asErrorPayload(result);
    if (errorPayload) {
      throw errorPayload;
    }

    return result;
  } finally {
    restoreSendTransactionEventHandler();
    queueMicrotask(() => restoreSendTransactionEventHandler());
  }
}

export function installMiniKitEventHandlers(): void {
  restoreSendTransactionEventHandler();
}

export function extractUserOpHash(result: SendTransactionResult): string | null {
  const envelope = result as {
    data?: { userOpHash?: string; status?: string };
    userOpHash?: string;
  };

  const hash =
    envelope.data?.userOpHash ??
    envelope.userOpHash ??
    null;

  if (!hash) {
    return null;
  }

  return hash;
}
