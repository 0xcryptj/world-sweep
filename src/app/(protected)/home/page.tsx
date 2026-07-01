import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { Page } from '@/components/PageLayout';
import { Sweep } from '@/components/Sweep';

export default async function HomePage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <AppHeader
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="mb-16 flex flex-col items-stretch justify-start gap-4">
        <Sweep />
      </Page.Main>
    </>
  );
}
