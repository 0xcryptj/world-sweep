import { auth } from '@/auth';
import ClientProviders from '@/providers';
import '@worldcoin/mini-apps-ui-kit-react/styles.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Forager',
  description:
    'Forage junk mini-app tokens into WLD in one transaction. 5% platform fee on WLD received.',
  icons: {
    icon: '/assets/pics/forager-logo.png',
    apple: '/assets/pics/forager-logo.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} overflow-x-hidden bg-forager-bg text-foreground antialiased`}
      >
        <ClientProviders session={session}>{children}</ClientProviders>
      </body>
    </html>
  );
}
