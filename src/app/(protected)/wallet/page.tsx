import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { LeaderboardPanel } from '@/components/Leaderboard';
import { Page } from '@/components/PageLayout';

export default async function WalletPage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <AppHeader
          title="Leaderboard"
          subtitle="WLD reclaimed across Forager"
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="mb-16 flex flex-col items-stretch justify-start gap-4">
        <LeaderboardPanel />
      </Page.Main>
    </>
  );
}
