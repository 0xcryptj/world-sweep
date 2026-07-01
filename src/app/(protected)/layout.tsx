import { auth } from '@/auth';
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
    redirect('/');
  }

  return (
    <Page className="h-dvh">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <Page.Footer className="w-full shrink-0 px-0">
        <Navigation />
      </Page.Footer>
    </Page>
  );
}
