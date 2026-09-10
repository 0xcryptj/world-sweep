import { handlers } from '@/auth';
import { getBasePath } from '@/lib/base-path';
import { NextRequest } from 'next/server';

const basePath = getBasePath();

function rewriteRequest(req: NextRequest) {
  const url = new URL(req.url);
  if (basePath && !url.pathname.startsWith(basePath)) {
    url.pathname = `${basePath}${url.pathname}`;
  }
  return new NextRequest(url, req);
}

export const GET = (req: NextRequest) => handlers.GET(rewriteRequest(req));
export const POST = (req: NextRequest) => handlers.POST(rewriteRequest(req));
