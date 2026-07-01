import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { Page } from '@/components/PageLayout';
import { ProfileStats } from '@/components/ProfileStats';

export default async function ProfilePage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <AppHeader
          title="Profile"
          subtitle="Stats & leaderboard"
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="flex flex-col items-stretch justify-start gap-4 pb-4">
        <ProfileStats />
      </Page.Main>
    </>
  );
}
