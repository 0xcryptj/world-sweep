import { Page } from '@/components/PageLayout';
import { AuthButton } from '@/components/AuthButton';
import { SignInWelcome } from '@/components/SignInWelcome';
import { AsciiArt } from '@/components/ui/trippin-spiral';

export default function EnterPage() {
  return (
    <Page className="forager-enter relative z-10 overflow-hidden bg-black">
      <div className="forager-enter-ascii" aria-hidden>
        <AsciiArt />
      </div>
      <Page.Main className="relative z-10 flex flex-col items-center justify-center overflow-visible bg-transparent py-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-[20rem] flex-col items-center gap-10 overflow-visible text-center">
          <SignInWelcome />
          <div className="forager-support-fade w-full">
            <AuthButton />
          </div>
        </div>
      </Page.Main>
    </Page>
  );
}
