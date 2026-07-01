import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { Page } from '@/components/PageLayout';
import { Sweep } from '@/components/Sweep';

export default async function HomePage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="shrink-0 p-0">
        <AppHeader
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 pt-3 pb-0">
        <Sweep />
      </Page.Main>
    </>
  );
}
