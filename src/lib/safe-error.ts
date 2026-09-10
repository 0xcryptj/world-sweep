/**
 * Turns arbitrary thrown errors into user-safe strings.
 *
 * Upstream RPC/viem errors embed the full keyed request URL, request body, and
 * raw call arguments in `error.message` (e.g. a 429 from Alchemy dumps
 * `https://worldchain-mainnet.g.alchemy.com/v2/<API_KEY>` verbatim). Those must
 * NEVER reach the client. Every API route returns the output of this helper
 * instead of a raw `error.message`.
 */

const RATE_LIMIT_MESSAGE =
  'The network is busy right now. Please try again in a moment.';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

function rawMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ?? '';
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

export function isRateLimitError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'isRateLimited' in error &&
    Boolean((error as { isRateLimited?: boolean }).isRateLimited)
  ) {
    return true;
  }

  const message = rawMessage(error);
  return /\b429\b|too many requests|rate[- ]?limit/i.test(message);
}

/**
 * Returns true if a message would leak infrastructure details (URLs, keyed
 * endpoints, RPC request bodies, stack-trace-like content).
 */
export function containsSensitiveDetails(message: string): boolean {
  return (
    /https?:\/\//i.test(message) ||
    /g\.alchemy\.com/i.test(message) ||
    /\/v2\//.test(message) ||
    /viem@|Contract Call|Raw Call Arguments|Request body|Request Arguments|eth_call|jsonrpc/i.test(
      message,
    ) ||
    /ALCHEMY_API_KEY|SERVICE_ROLE|SECRET|PRIVATE_KEY/i.test(message) ||
    message.includes('\n')
  );
}

/**
 * Scrubs details strings shown in error banners: strips debug URLs and long
 * simulator dumps that MiniKit sometimes stuffs into `details.simulation_error`,
 * while preserving short human-readable reasons. Returns null when nothing
 * useful is left to show.
 */
export function sanitizeErrorDetails(details: string | undefined | null): string | undefined {
  if (!details) {
    return undefined;
  }

  const cleaned = details
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,;:\s]+$/g, '')
    .trim();

  if (!cleaned) {
    return undefined;
  }

  if (containsSensitiveDetails(cleaned) || cleaned.length > 200) {
    return undefined;
  }

  return cleaned;
}

/**
 * Maps any error to a short, on-brand message that is always safe to render to
 * users. Preserves our own author-written short messages (timeouts, validation)
 * but replaces anything that looks like an infra/RPC dump with a generic line.
 */
export function sanitizeErrorMessage(
  error: unknown,
  fallback: string = GENERIC_MESSAGE,
): string {
  if (isRateLimitError(error)) {
    return RATE_LIMIT_MESSAGE;
  }

  const message = rawMessage(error).trim();
  if (!message) {
    return fallback;
  }

  if (containsSensitiveDetails(message)) {
    return fallback;
  }

  // Author-written messages are concise, single-line, and free of infra
  // details. Anything longer is treated as untrusted and replaced.
  if (message.length <= 160) {
    return message;
  }

  return fallback;
}
