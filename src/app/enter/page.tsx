import { Page } from '@/components/PageLayout';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { AuthButton } from '@/components/AuthButton';
import { TechScramble } from '@/components/ui/tech-scramble';

export default function EnterPage() {
  return (
    <Page className="relative z-10">
      <Page.Main className="relative z-10 flex flex-col items-center justify-center py-10">
        <div className="flex w-full max-w-[20rem] flex-col items-center gap-10 text-center">
          <div className="flex flex-col items-center gap-3">
            <TechScramble text={APP_NAME} className="forager-display" />
            <p className="forager-support-fade max-w-[18rem] text-[17px] leading-snug text-forager-text-muted">
              {APP_TAGLINE}
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
