import 'server-only';

import { formatUnits } from 'viem';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  ForageEvent,
  LeaderboardResponse,
} from './forage-stats-types';
import { aggregateStats, buildLeaderboard } from './forage-stats-utils';

const DATA_FILE = path.join(process.cwd(), 'data', 'forage-events.json');

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
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured');
  }

  const response = await fetch(`${config.url}/rest/v1/${endpoint}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Supabase request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readFileEvents(): Promise<ForageEvent[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { events?: ForageEvent[] };
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

async function writeFileEvents(events: ForageEvent[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify({ events }, null, 2), 'utf8');
}

function mapSupabaseRow(row: Record<string, unknown>): ForageEvent {
  return {
    id: String(row.id),
    walletAddress: String(row.wallet_address),
    username: row.username ? String(row.username) : null,
    profilePictureUrl: row.profile_picture_url
      ? String(row.profile_picture_url)
      : null,
    wldReceivedWei: String(row.wld_received_wei),
    wldReceived: Number(row.wld_received ?? 0),
    tokensSwapped: Number(row.tokens_swapped ?? 0),
    userOpHash: row.user_op_hash ? String(row.user_op_hash) : null,
    txHash: row.tx_hash ? String(row.tx_hash) : null,
    createdAt: String(row.created_at),
  };
}

export async function recordForageEvent(input: {
  walletAddress: string;
  username?: string | null;
  profilePictureUrl?: string | null;
  wldReceivedWei: string;
  tokensSwapped: number;
  userOpHash?: string | null;
  txHash?: string | null;
}): Promise<ForageEvent> {
  const wldReceived = Number(formatUnits(BigInt(input.wldReceivedWei), 18));
  const createdAt = new Date().toISOString();

  const event: ForageEvent = {
    id: crypto.randomUUID(),
    walletAddress: input.walletAddress,
    username: input.username ?? null,
    profilePictureUrl: input.profilePictureUrl ?? null,
    wldReceivedWei: input.wldReceivedWei,
    wldReceived,
    tokensSwapped: input.tokensSwapped,
    userOpHash: input.userOpHash ?? null,
    txHash: input.txHash ?? null,
    createdAt,
  };

  if (getSupabaseConfig()) {
    await supabaseFetch('forage_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        wallet_address: event.walletAddress,
        username: event.username,
        profile_picture_url: event.profilePictureUrl,
        wld_received_wei: event.wldReceivedWei,
        wld_received: event.wldReceived,
        tokens_swapped: event.tokensSwapped,
        user_op_hash: event.userOpHash,
        tx_hash: event.txHash,
      }),
    });

    return event;
  }

  const events = await readFileEvents();
  events.unshift(event);
  await writeFileEvents(events);
  return event;
}

export async function getLeaderboardData(
  walletAddress?: string,
): Promise<LeaderboardResponse> {
  let events: ForageEvent[] = [];

  if (getSupabaseConfig()) {
    const rows = await supabaseFetch<Record<string, unknown>[]>(
      'forage_events?select=*&order=created_at.desc&limit=5000',
    );
    events = rows.map(mapSupabaseRow);
  } else {
    events = await readFileEvents();
  }

  const stats = aggregateStats(events);
  const leaderboard = buildLeaderboard(events).slice(0, 25);

  if (!walletAddress) {
    return {
      stats,
      leaderboard,
      userRank: null,
      userRankPosition: null,
    };
  }

  const fullLeaderboard = buildLeaderboard(events);
  const index = fullLeaderboard.findIndex(
    (entry) =>
      entry.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
  );

  return {
    stats,
    leaderboard,
    userRank: index >= 0 ? fullLeaderboard[index] : null,
    userRankPosition: index >= 0 ? index + 1 : null,
  };
}
