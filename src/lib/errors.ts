import { sanitizeErrorDetails } from './safe-error';

export type AppError = {
  title: string;
  message: string;
  details?: string;
  code?: string;
};

function makeError(error: AppError): AppError {
  return {
    ...error,
    details: sanitizeErrorDetails(error.details),
  };
}

const ERROR_TITLES: Record<string, string> = {
  invalid_contract: 'Token not allowlisted',
  invalid_token: 'Token not allowlisted',
  simulation_failed: 'Simulation failed',
  user_rejected: 'Cancelled',
  transaction_failed: 'On-chain failure',
  permitted_amount_exceeds_slippage: 'Slippage too tight',
  permitted_amount_not_found: 'Token approval missing',
  daily_tx_limit_reached: 'Daily limit reached',
  input_error: 'Invalid transaction',
  validation_error: 'Validation failed',
  disallowed_operation: 'Operation not allowed',
  malicious_operation: 'Blocked as unsafe',
  generic_error: 'Unexpected error',
  invalid_operation: 'Invalid operation',
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_contract:
    'One token in this batch is still syncing to World’s allowlist. We skip those automatically on the next forage — wait a minute, fully close and reopen World App, then rescan.',
  invalid_token:
    'One or more tokens are still syncing to the Permit2 allowlist. They were skipped — reopen World App in a minute and rescan to include them.',
  simulation_failed:
    'World App could not simulate this swap batch. One token may block transfers or swaps even when quoted — try foraging fewer tokens at a time, or deselect the most recent junk tokens and rescan.',
  user_rejected: 'You cancelled the transaction in World App.',
  transaction_failed:
    'The transaction was submitted but reverted on-chain. Try fewer tokens or preview the sweep first.',
  permitted_amount_exceeds_slippage:
    'A swap must use at least 90% of the permitted token amount. Rebuild the sweep and try again.',
  permitted_amount_not_found:
    'The swap router could not pull one of the tokens. Rescan your wallet and try again.',
  daily_tx_limit_reached:
    'World App allows up to 100 transactions per day. Try again tomorrow.',
  input_error: 'The forage payload was invalid. Tap Preview Forage, then try again.',
  validation_error:
    'World App rejected the transaction before sending. Try fewer tokens or rescan after allowlist sync.',
  disallowed_operation: 'This type of transaction is not allowed in mini apps.',
  malicious_operation: 'World App flagged this transaction as unsafe.',
  generic_error: 'Something unexpected happened in World App.',
  invalid_operation: 'This transaction includes an operation World App does not support.',
};

function humanizeCode(code: string): string {
  return code.replaceAll('_', ' ');
}

function formatDetails(details: unknown): string | undefined {
  if (!details) {
    return undefined;
  }

  if (typeof details === 'string') {
    return details;
  }

  if (typeof details !== 'object') {
    return String(details);
  }

  const record = details as Record<string, unknown>;
  const parts: string[] = [];

  const preferredKeys = [
    'simulation_error',
    'simulationError',
    'message',
    'description',
    'reason',
    'contract',
    'token',
    'address',
    'mini_app_id',
  ];

  for (const key of preferredKeys) {
    const value = record[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (typeof value === 'string') {
      parts.push(`${key}: ${value}`);
      continue;
    }

    if (typeof value === 'object') {
      parts.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }

    parts.push(`${key}: ${String(value)}`);
  }

  if (parts.length > 0) {
    return parts.join(' · ');
  }

  try {
    return JSON.stringify(record);
  } catch {
    return undefined;
  }
}

function isEmptyRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

function fromErrorCode(code: string, details?: unknown): AppError {
  return makeError({
    code,
    title: ERROR_TITLES[code] ?? humanizeCode(code),
    message: ERROR_MESSAGES[code] ?? `World App returned: ${humanizeCode(code)}`,
    details: formatDetails(details),
  });
}

export function formatApiError(message: string): AppError {
  if (message.includes('Quote RPC') || message.includes('Quote unavailable')) {
    return makeError({
      title: 'Quote temporarily unavailable',
      message:
        'World Chain RPC was busy while quoting. Your tokens are still selected — wait a moment and retry preview.',
      details: message,
    });
  }

  if (message.includes('Swap simulation failed') || message.includes('Forage batch failed simulation')) {
    return makeError({
      title: 'Swap simulation failed',
      message:
        'One selected token cannot be swapped on-chain right now. It was skipped — retry forage with the rest.',
      details: message,
    });
  }

  if (message.includes('Approval simulation failed')) {
    return makeError({
      title: 'Token approval failed',
      message:
        'One or more selected tokens cannot approve the Uniswap router on World Chain. Deselect the failing token and retry forage.',
      details: message,
    });
  }

  if (message.includes('Transfer simulation failed')) {
    return makeError({
      title: 'Token transfer blocked',
      message:
        'One or more selected tokens cannot be transferred to the router contract. These tokens are usually restricted or unsellable. Deselect them and retry.',
      details: message,
    });
  }

  if (message.includes('can be approved for swap execution')) {
    return makeError({
      title: 'No approvable tokens',
      message:
        'Selected tokens failed approval simulation in World App. Rescan and forage fewer tokens, or deselect tokens that recently changed.',
      details: message,
    });
  }

  if (message.includes('No selected tokens have a swappable route')) {
    return {
      title: 'Route quote failed',
      message:
        'Selected tokens do not have a reliable Uniswap V3 route to WLD on World Chain. Try rescanning or picking different tokens.',
    };
  }

  if (message.includes('timed out') || message.includes('did not respond')) {
    return makeError({
      title: 'Request timed out',
      message:
        'The server or World App took too long to respond. Check your connection, keep World App open, and try again.',
      details: message,
    });
  }

  if (message.includes('ALCHEMY_API_KEY')) {
    return makeError({
      title: 'Token scan unavailable',
      message: 'Wallet scanning is not configured on the server.',
      details: message,
    });
  }

  if (message.includes('PLATFORM_FEE_WALLET')) {
    return makeError({
      title: 'App misconfigured',
      message: 'Platform fee wallet is not set.',
      details: message,
    });
  }

  return makeError({
    title: 'Something went wrong',
    message,
  });
}

function extractNestedErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    code?: string;
    error_code?: string;
    name?: string;
    message?: string;
    details?: { error_code?: string; code?: string };
    data?: {
      error_code?: string;
      code?: string;
      status?: string;
      details?: { error_code?: string };
    };
  };

  const raw =
    candidate.code ??
    candidate.error_code ??
    candidate.data?.error_code ??
    candidate.data?.code ??
    candidate.details?.error_code ??
    candidate.details?.code ??
    (candidate.message?.startsWith('Transaction failed:')
      ? candidate.message.replace('Transaction failed:', '').trim()
      : undefined);

  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }

  return undefined;
}

export function formatMiniKitError(error: unknown): AppError {
  if (!error || typeof error !== 'object') {
    return {
      title: 'No response from World App',
      message: 'The transaction did not return an error or success payload.',
    };
  }

  if (isSimulationFailedError(error)) {
    return makeError({
      code: 'simulation_failed',
      title: 'Simulation failed',
      message:
        "World App couldn't simulate this swap batch. One selected token likely blocks the router — we'll skip failing tokens automatically. Deselect recent junk and try again.",
      details: formatDetails(
        (error as { details?: unknown; data?: { details?: unknown } }).details ??
          (error as { data?: { details?: unknown } }).data?.details,
      ),
    });
  }

  const candidate = error as {
    code?: string;
    error_code?: string;
    message?: string;
    shortMessage?: string;
    details?: unknown;
    data?: {
      error_code?: string;
      details?: unknown;
      status?: string;
    };
  };

  const code = extractNestedErrorCode(error);
  const details = candidate.details ?? candidate.data?.details;

  if (code) {
    const normalizedCode =
      code === 'invalid_token' ? 'invalid_contract' : code;
    const formatted = fromErrorCode(
      normalizedCode,
      isEmptyRecord(details) ? undefined : details,
    );
    const nativeMessage = candidate.message ?? candidate.shortMessage;

    if (
      nativeMessage &&
      !formatted.details &&
      nativeMessage !== `Transaction failed: ${code}`
    ) {
      formatted.details = nativeMessage;
    }

    return formatted;
  }

  const message =
    candidate.message ?? candidate.shortMessage ?? 'Forage transaction failed';

  if (message.includes('No userOpHash')) {
    return {
      title: 'Not submitted',
      message: 'World App did not return a transaction hash.',
      details: message,
    };
  }

  if (/did not respond in time|timed out/i.test(message)) {
    return {
      title: 'World App timed out',
      message:
        'World App kept the transaction in processing and did not return a result. Keep the app open and retry with fewer tokens.',
      details: message,
    };
  }

  if (/unavailable|oldAppVersion|update the app/i.test(message)) {
    return makeError({
      title: 'Update World App',
      message:
        'This forage needs a current World App. Update World App from the store, then reopen Forager.',
      details: message,
    });
  }

  if (message.startsWith('Transaction failed:')) {
    const inferredCode = message.replace('Transaction failed:', '').trim();
    const normalizedCode =
      inferredCode === 'invalid_token' ? 'invalid_contract' : inferredCode;
    if (ERROR_TITLES[normalizedCode]) {
      return fromErrorCode(normalizedCode, details);
    }
  }

  if (/invalid.?token/i.test(message)) {
    return fromErrorCode('invalid_contract', details ?? message);
  }

  return formatApiError(message);
}

export function shortErrorLabel(error: AppError): string {
  if (error.code && ERROR_TITLES[error.code]) {
    return ERROR_TITLES[error.code];
  }

  return error.title;
}

export function isSimulationFailedError(error: unknown): boolean {
  const code = getMiniKitErrorCode(error);
  if (code === 'simulation_failed') {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: string };
  return /simulation.?failed/i.test(candidate.message ?? '');
}

export function isUserRejectedError(error: unknown): boolean {
  const code = getMiniKitErrorCode(error);
  if (code === 'user_rejected') {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: string };
  return /user.?rejected|cancelled|canceled/i.test(candidate.message ?? '');
}

export function getMiniKitErrorCode(error: unknown): string | undefined {
  const code = extractNestedErrorCode(error);
  if (!code) {
    return undefined;
  }
  return code === 'invalid_token' ? 'invalid_contract' : code;
}
