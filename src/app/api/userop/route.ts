import { NextResponse } from 'next/server';

type UserOpStatusResponse = {
  status?: 'pending' | 'success' | 'failed';
  userOpHash?: string;
  transaction_hash?: string | null;
  detail?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userOpHash = searchParams.get('hash');

  if (!userOpHash) {
    return NextResponse.json({ error: 'Missing user operation hash' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://developer.worldcoin.org/api/v2/minikit/userop/${encodeURIComponent(userOpHash)}`,
      { next: { revalidate: 0 } },
    );

    const payload = (await response.json()) as UserOpStatusResponse & {
      code?: string;
      detail?: string;
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload.detail ?? 'Failed to fetch user operation status',
          status: payload.status,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch user operation status',
      },
      { status: 500 },
    );
  }
}
