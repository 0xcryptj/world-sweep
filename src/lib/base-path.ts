/** Subpath on forag3r.app where this mini app is hosted. */
export function getBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH;
  if (raw === '' || raw === '/') {
    return '';
  }
  return (raw ?? '/world').replace(/\/$/, '');
}

export function withBasePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = getBasePath();
  if (!base) {
    return normalized;
  }
  if (normalized === base || normalized.startsWith(`${base}/`)) {
    return normalized;
  }
  return `${base}${normalized}`;
}

export function apiPath(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  return withBasePath(normalized);
}

/** NextAuth route prefix, e.g. `/world/api/auth`. */
export function getAuthBasePath(): string {
  return withBasePath('/api/auth');
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) {
    return configured;
  }

  const base = getBasePath();
  return base ? `https://forag3r.app${base}` : 'https://forag3r.app/world';
}
