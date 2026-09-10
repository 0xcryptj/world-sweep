import { auth } from '@/auth';
import { AppHeader } from '@/components/AppHeader';
import { Page } from '@/components/PageLayout';
import { WalletPanel } from '@/components/WalletPanel';

export default async function WalletPage() {
  const session = await auth();

  return (
    <>
      <Page.Header>
        <AppHeader
          title="Wallet"
          username={session?.user?.username}
          profilePictureUrl={session?.user?.profilePictureUrl}
        />
      </Page.Header>
      <Page.Main className="flex flex-col items-stretch justify-start">
        <WalletPanel />
      </Page.Main>
    </>
  );
}
