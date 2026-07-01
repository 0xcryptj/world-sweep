import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { Page } from '@/components/PageLayout';
import { WalletPanel } from '@/components/WalletPanel';

export default async function WalletPage() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <AppHeader
          title="Wallet"
          subtitle="Your World Chain balances"
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="flex flex-col items-stretch justify-start gap-4 pb-4">
        <WalletPanel />
      </Page.Main>
    </>
  );
}
