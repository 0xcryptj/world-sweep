import { auth } from '@/auth';
import { FeeFootnote } from '@/components/FeeFootnote';
import { InviteAttributionBootstrap } from '@/components/Growth/InviteAttributionBootstrap';
import { Navigation } from '@/components/Navigation';
import { Page } from '@/components/PageLayout';
import { redirect } from 'next/navigation';

export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // If the user is not authenticated, redirect to the login page
  if (!session) {
    redirect('/enter');
  }

  return (
    <Page className="relative z-10 h-dvh">
      <InviteAttributionBootstrap />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <Page.Footer className="w-full shrink-0 px-0">
        <FeeFootnote />
        <Navigation />
      </Page.Footer>
    </Page>
  );
}
