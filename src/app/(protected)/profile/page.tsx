import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { Page } from '@/components/PageLayout';
import { ProfileStats } from '@/components/ProfileStats';

export default async function ProfilePage() {
  const session = await auth();

  return (
    <>
      <Page.Header>
        <AppHeader
          title="Profile"
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="flex flex-col items-stretch justify-start">
        <ProfileStats />
      </Page.Main>
    </>
  );
}
