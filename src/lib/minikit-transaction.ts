import { MiniKit } from '@worldcoin/minikit-js';

const SEND_TRANSACTION_EVENT = 'miniapp-send-transaction';

type SendTransactionOptions = Parameters<typeof MiniKit.sendTransaction>[0];
type SendTransactionResult = Awaited<ReturnType<typeof MiniKit.sendTransaction>>;

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

export async function sendMiniKitTransaction(
  options: SendTransactionOptions,
): Promise<SendTransactionResult> {
  try {
    return await MiniKit.sendTransaction(options);
  } finally {
    restoreSendTransactionEventHandler();
    queueMicrotask(() => restoreSendTransactionEventHandler());
  }
}

export function installMiniKitEventHandlers(): void {
  restoreSendTransactionEventHandler();
}
