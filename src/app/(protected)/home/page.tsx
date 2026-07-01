import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';
import { Sweep } from '@/components/Sweep';
import { Marble, TopBar } from '@worldcoin/mini-apps-ui-kit-react';

export default async function Home() {
  const session = await auth();

  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="World Sweep"
          endAdornment={
            session?.user ? (
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold capitalize">
                  {session.user.username}
                </p>
                <Marble src={session.user.profilePictureUrl} className="w-12" />
              </div>
            ) : undefined
          }
        />
      </Page.Header>
      <Page.Main className="mb-16 flex flex-col items-stretch justify-start gap-4">
        <Sweep />
      </Page.Main>
    </>
  );
}
