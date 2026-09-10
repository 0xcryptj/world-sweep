/** Growth helpers: invites, share links, Quick Actions, local attribution. */

export const FORAGER_APP_ID =
  process.env.NEXT_PUBLIC_APP_ID?.trim() ||
  'app_a05e0d4389f6fa77f5380724caf300bb';

export const WORLD_MINI_APP_BASE = 'https://world.org/mini-app';

export const REFERRAL_STORAGE_KEY = 'forager_world_invite_code';
export const WIDGET_PROMPT_DISMISSED_KEY = 'forager_widget_prompt_dismissed';
export const NOTIFY_PROMPT_DISMISSED_KEY = 'forager_notify_prompt_dismissed';

/** Referral code = first 4 + last 4 of wallet (matches main Forager). */
export function inviteCodeFromWallet(wallet: string): string {
  const normalized = wallet.trim();
  if (normalized.length < 8) return normalized;
  return `${normalized.slice(0, 4)}${normalized.slice(-4)}`;
}

export function sanitizeInviteCode(code: string | undefined | null): string | null {
  if (!code) return null;
  const cleaned = code.trim().slice(0, 16);
  return /^[a-zA-Z0-9]+$/.test(cleaned) ? cleaned : null;
}

/**
 * Universal link that opens Forager inside World App.
 * `path` is URL-encoded per World docs.
 */
export function buildMiniAppLink(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${WORLD_MINI_APP_BASE}?app_id=${FORAGER_APP_ID}&path=${encodeURIComponent(normalized)}`;
}

export function buildInviteLink(inviteCode: string): string {
  const code = sanitizeInviteCode(inviteCode);
  if (!code) {
    return buildMiniAppLink('/home');
  }
  return buildMiniAppLink(`/invite?code=${code}`);
}

export function buildForageShareText(params: {
  wldAmountLabel: string;
  tokenCount: number;
}): string {
  const tokenWord = params.tokenCount === 1 ? 'junk token' : 'junk tokens';
  return `Just foraged ${params.tokenCount} ${tokenWord} into ${params.wldAmountLabel} WLD on Forager. Clean your World Chain wallet:`;
}

export function getStoredInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  return sanitizeInviteCode(localStorage.getItem(REFERRAL_STORAGE_KEY));
}

export function storeInviteCode(code: string): void {
  if (typeof window === 'undefined') return;
  const cleaned = sanitizeInviteCode(code);
  if (cleaned) {
    localStorage.setItem(REFERRAL_STORAGE_KEY, cleaned);
  }
}

export function clearStoredInviteCode(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFERRAL_STORAGE_KEY);
}

/**
 * Quick Action schema for partner mini apps to deep-link into Forager.
 * Submit via https://forms.gle/UBcKMrnxtyxqX4dq6 for World docs listing.
 *
 * Path: `/home` — open forage flow
 * Path: `/invite?code={code}` — invite attribution landing
 * Optional query: `sourceAppId`, `sourceAppName` for hand-back
 */
export function getForagerQuickActionLink(params?: {
  path?: string;
  sourceAppId?: string;
  sourceAppName?: string;
}): string {
  let path = params?.path ?? '/home';
  const extras: string[] = [];
  if (params?.sourceAppId) {
    extras.push(`sourceAppId=${params.sourceAppId}`);
  }
  if (params?.sourceAppName) {
    extras.push(`sourceAppName=${encodeURIComponent(params.sourceAppName)}`);
  }
  if (extras.length > 0) {
    path += (path.includes('?') ? '&' : '?') + extras.join('&');
  }
  return buildMiniAppLink(path);
}
