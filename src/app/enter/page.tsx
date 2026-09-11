import { Page } from '@/components/PageLayout';
import { APP_NAME, APP_SIGNIN_TAGLINE } from '@/lib/branding';
import { AuthButton } from '@/components/AuthButton';
import { BaseScrambleHeadline } from '@/components/brand/BaseScrambleHeadline';
import { AsciiArt } from '@/components/ui/trippin-spiral';

export default function EnterPage() {
  return (
    <Page className="relative z-10 bg-black">
      <div className="forager-enter-ascii" aria-hidden>
        <AsciiArt />
      </div>
      <Page.Main className="relative z-10 flex flex-col items-center justify-center overflow-visible bg-transparent py-10">
        <div className="flex w-full max-w-[20rem] flex-col items-center gap-10 overflow-visible text-center">
          <div className="flex flex-col items-center gap-5 overflow-visible">
            <BaseScrambleHeadline
              as="h1"
              text={APP_NAME}
              deferUntilReveal
              className="forager-display forager-wordmark"
            />
            <p className="forager-support-fade max-w-[18rem] text-[17px] leading-[1.4] text-forager-text-muted">
              {APP_SIGNIN_TAGLINE}
            </p>
          </div>
          <div className="forager-support-fade w-full">
            <AuthButton />
          </div>
        </div>
      </Page.Main>
    </Page>
  );
}
