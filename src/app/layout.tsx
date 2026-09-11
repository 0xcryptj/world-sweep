import { auth } from '@/auth';
import { APP_LOGO_SRC } from '@/lib/branding';
import { FORAGE_SPRITE_SRC } from '@/lib/forage-sprite';
import { WorldAtmosphere } from '@/components/WorldAtmosphere';
import ClientProviders from '@/providers';
import '@worldcoin/mini-apps-ui-kit-react/styles.css';
import type { Metadata } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import './globals.css';

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Forager',
  description:
    'Surface leftover World Chain tokens and reclaim them as WLD. You approve every step.',
  icons: {
    icon: APP_LOGO_SRC,
    apple: APP_LOGO_SRC,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable} h-dvh overflow-hidden`}
    >
      <head>
        <link rel="preload" as="image" href={APP_LOGO_SRC} />
        <link rel="preload" as="image" href={FORAGE_SPRITE_SRC} />
      </head>
      <body className="relative h-dvh overflow-hidden bg-forager-bg text-foreground antialiased">
        <WorldAtmosphere />
        <ClientProviders session={session}>{children}</ClientProviders>
      </body>
    </html>
  );
}
