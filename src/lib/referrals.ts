import 'server-only';

import { inviteCodeFromWallet, sanitizeInviteCode } from './growth';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return { url, serviceKey };
}

async function supabaseFetch<T>(
  endpoint: string,
  init?: RequestInit,
): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}/rest/v1/${endpoint}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Supabase request failed');
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

export async function ensureInviteCode(walletAddress: string): Promise<string> {
  const code = inviteCodeFromWallet(walletAddress);
  const config = getSupabaseConfig();
  if (!config) {
    return code;
  }

  await supabaseFetch(`referral_codes?on_conflict=referrer_wallet`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      code,
      referrer_wallet: walletAddress,
    }),
  });

  return code;
}

export async function getInviteStats(walletAddress: string): Promise<{
  inviteCode: string;
  inviteCount: number;
}> {
  const inviteCode = await ensureInviteCode(walletAddress);
  const config = getSupabaseConfig();
  if (!config) {
    return { inviteCode, inviteCount: 0 };
  }

  const rows = await supabaseFetch<Array<{ id: string }>>(
    `referral_attributions?select=id&referral_code=eq.${encodeURIComponent(inviteCode)}`,
  );

  return {
    inviteCode,
    inviteCount: rows?.length ?? 0,
  };
}

export async function attributeInvite(params: {
  walletAddress: string;
  inviteCode: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const code = sanitizeInviteCode(params.inviteCode);
  if (!code) {
    return { ok: false, reason: 'invalid_code' };
  }

  const ownCode = inviteCodeFromWallet(params.walletAddress);
  if (ownCode.toLowerCase() === code.toLowerCase()) {
    return { ok: false, reason: 'self_referral' };
  }

  const config = getSupabaseConfig();
  if (!config) {
    return { ok: false, reason: 'db_unavailable' };
  }

  const codeRows = await supabaseFetch<Array<{ referrer_wallet: string }>>(
    `referral_codes?select=referrer_wallet&code=eq.${encodeURIComponent(code)}&limit=1`,
  );

  const referrer = codeRows?.[0]?.referrer_wallet;
  if (!referrer) {
    // Register missing codes lazily if the referrer never opened Profile.
    // Codes are deterministic from wallet — reject unknown codes.
    return { ok: false, reason: 'unknown_code' };
  }

  if (referrer.toLowerCase() === params.walletAddress.toLowerCase()) {
    return { ok: false, reason: 'self_referral' };
  }

  try {
    await supabaseFetch(
      'referral_attributions?on_conflict=referred_wallet',
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify({
          referral_code: code,
          referred_wallet: params.walletAddress,
        }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate|unique/i.test(message)) {
      return { ok: true, reason: 'already_attributed' };
    }
    throw error;
  }

  return { ok: true };
}
