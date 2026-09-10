import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { GlobalMetrics } from '@/components/GlobalMetrics';
import { Page } from '@/components/PageLayout';
import { Sweep } from '@/components/Sweep';

export default async function HomePage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="shrink-0">
        <AppHeader
          title="Forage"
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="flex min-h-0 flex-1 flex-col overflow-hidden pl-[var(--forager-page-x)] pr-[var(--forager-page-x-end)] pb-0">
        <div className="mb-8 shrink-0">
          <GlobalMetrics />
        </div>
        <Sweep />
      </Page.Main>
    </>
  );
}
