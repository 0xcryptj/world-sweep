import 'server-only';

import { FORAGER_APP_ID } from './growth';

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

export async function recordNotificationOptIn(
  walletAddress: string,
): Promise<void> {
  await supabaseFetch(
    `world_notification_opt_ins?on_conflict=wallet_address`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        wallet_address: walletAddress.toLowerCase(),
        opted_in_at: new Date().toISOString(),
        source: 'mini_app',
      }),
    },
  );
}

export async function listOptedInWallets(limit = 200): Promise<string[]> {
  const rows = await supabaseFetch<Array<{ wallet_address: string }>>(
    `world_notification_opt_ins?select=wallet_address&order=last_notified_at.asc.nullsfirst&limit=${limit}`,
  );
  return (rows ?? []).map((row) => row.wallet_address);
}

export async function markNotified(walletAddresses: string[]): Promise<void> {
  if (walletAddresses.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  await Promise.all(
    walletAddresses.map((wallet) =>
      supabaseFetch(
        `world_notification_opt_ins?wallet_address=eq.${encodeURIComponent(wallet.toLowerCase())}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ last_notified_at: now }),
        },
      ),
    ),
  );
}

type SendNotificationInput = {
  walletAddresses: string[];
  title: string;
  message: string;
  path?: string;
};

/**
 * Functional notifications only — World pauses apps with low open rates.
 * Requires WORLD_DEVELOPER_API_KEY (same as portal sync).
 */
export async function sendWorldNotification(
  input: SendNotificationInput,
): Promise<{ sent: number; failed: number }> {
  const apiKey = process.env.WORLD_DEVELOPER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('WORLD_DEVELOPER_API_KEY is not configured');
  }

  const wallets = input.walletAddresses.slice(0, 1000);
  if (wallets.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const path = input.path ?? '/home';
  const miniAppPath = `worldapp://mini-app?app_id=${FORAGER_APP_ID}&path=${encodeURIComponent(path)}`;

  const response = await fetch(
    'https://developer.worldcoin.org/api/v2/minikit/send-notification',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: FORAGER_APP_ID,
        wallet_addresses: wallets,
        localisations: [
          {
            language: 'en',
            title: input.title.slice(0, 30),
            message: input.message,
          },
        ],
        mini_app_path: miniAppPath,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to send notification');
  }

  const payload = (await response.json()) as {
    result?: Array<{ sent?: boolean }>;
  };

  const results = payload.result ?? [];
  const sent = results.filter((row) => row.sent).length;
  const failed = results.length - sent;

  await markNotified(wallets);
  return { sent, failed };
}
