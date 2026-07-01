export type AppError = {
  title: string;
  message: string;
  details?: string;
  code?: string;
};

const ERROR_TITLES: Record<string, string> = {
  invalid_contract: 'Token not allowlisted',
  invalid_token: 'Token not allowlisted',
  simulation_failed: 'Simulation failed',
  user_rejected: 'Cancelled',
  transaction_failed: 'On-chain failure',
  permitted_amount_exceeds_slippage: 'Slippage too tight',
  permitted_amount_not_found: 'Permit2 allowance missing',
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
    'World App blocked a token or contract that is not allowlisted in the Developer Portal (Contract Entrypoints and Permit2 Tokens). After adding addresses, wait a few minutes, fully close and reopen the mini app, then try again.',
  invalid_token:
    'One or more tokens in this batch are not on the Permit2 allowlist. Preview again after rescanning — only allowlisted tokens with liquidity are included.',
  simulation_failed:
    'World App could not simulate this swap batch. One token may block transfers or swaps even when quoted — try foraging fewer tokens at a time, or deselect the most recent junk tokens and rescan.',
  user_rejected: 'You cancelled the transaction in World App.',
  transaction_failed:
    'The transaction was submitted but reverted on-chain. Try fewer tokens or preview the sweep first.',
  permitted_amount_exceeds_slippage:
    'A swap must use at least 90% of the permitted token amount. Rebuild the sweep and try again.',
  permitted_amount_not_found:
    'Permit2 could not find the token allowance for one of the swaps. Rescan your wallet and try again.',
  daily_tx_limit_reached:
    'World App allows up to 100 transactions per day. Try again tomorrow.',
  input_error: 'The forage payload was invalid. Tap Preview Forage, then try again.',
  validation_error:
    'World App rejected the transaction before sending. Check your portal allowlists.',
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
  return {
    code,
    title: ERROR_TITLES[code] ?? humanizeCode(code),
    message: ERROR_MESSAGES[code] ?? `World App returned: ${humanizeCode(code)}`,
    details: formatDetails(details),
  };
}

export function formatApiError(message: string): AppError {
  if (message.includes('No selected tokens have a swappable route')) {
    return {
      title: 'No swappable tokens',
      message:
        'None of the selected tokens have enough Uniswap V3 liquidity to convert into WLD. Deselect tokens without a route or try Preview Forage to see which ones were skipped.',
    };
  }

  if (message.includes('ALCHEMY_API_KEY')) {
    return {
      title: 'Token scan unavailable',
      message: 'Wallet scanning is not configured on the server.',
      details: message,
    };
  }

  if (message.includes('PLATFORM_FEE_WALLET')) {
    return {
      title: 'App misconfigured',
      message: 'Platform fee wallet is not set.',
      details: message,
    };
  }

  return {
    title: 'Something went wrong',
    message,
  };
}

export function formatMiniKitError(error: unknown): AppError {
  if (!error || typeof error !== 'object') {
    return {
      title: 'No response from World App',
      message: 'The transaction did not return an error or success payload.',
    };
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

  const code =
    candidate.code ??
    candidate.error_code ??
    candidate.data?.error_code;

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
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string;
    error_code?: string;
    data?: { error_code?: string };
    message?: string;
  };

  const code =
    candidate.code ??
    candidate.error_code ??
    candidate.data?.error_code;

  return (
    code === 'simulation_failed' ||
    /simulation.?failed/i.test(candidate.message ?? '')
  );
}

export function isUserRejectedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string;
    error_code?: string;
    data?: { error_code?: string };
    message?: string;
  };

  const code =
    candidate.code ??
    candidate.error_code ??
    candidate.data?.error_code;

  return (
    code === 'user_rejected' ||
    /user.?rejected|cancelled|canceled/i.test(candidate.message ?? '')
  );
}

export function getMiniKitErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    code?: string;
    error_code?: string;
    data?: { error_code?: string };
    message?: string;
  };

  return (
    candidate.code ??
    candidate.error_code ??
    candidate.data?.error_code ??
    (candidate.message?.startsWith('Transaction failed:')
      ? candidate.message.replace('Transaction failed:', '').trim()
      : undefined)
  );
}
