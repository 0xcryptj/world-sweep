import type { Metadata } from 'next';
import { APP_DESCRIPTION, APP_LOGO_SRC, APP_NAME } from '@/lib/branding';
import { getSiteUrl } from '@/lib/base-path';

/**
 * OG tags for World universal-link previews.
 * world.org/mini-app?...&path=/invite?code=… forwards og:image from this URL.
 */
export const metadata: Metadata = {
  title: `${APP_NAME} — invite`,
  description: APP_DESCRIPTION,
  openGraph: {
    title: `${APP_NAME} — turn junk tokens into WLD`,
    description: APP_DESCRIPTION,
    url: `${getSiteUrl()}/invite`,
    images: [{ url: APP_LOGO_SRC }],
  },
  twitter: {
    card: 'summary',
    title: `${APP_NAME} — turn junk tokens into WLD`,
    description: APP_DESCRIPTION,
    images: [APP_LOGO_SRC],
  },
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
