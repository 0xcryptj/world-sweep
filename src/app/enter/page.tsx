import { ForagerHeroMark } from '@/components/ForagerHeroMark';
import { Page } from '@/components/PageLayout';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { AuthButton } from '@/components/AuthButton';

export default function EnterPage() {
  return (
    <Page className="relative z-10">
      <Page.Main className="flex flex-col items-center justify-center py-10">
        <div className="flex w-full max-w-[22rem] flex-col items-center gap-8 text-center">
          <ForagerHeroMark size={168} />
          <div className="flex flex-col items-center gap-3">
            <h1 className="forager-display">{APP_NAME}</h1>
            <p className="max-w-[17.5rem] text-[17px] leading-snug text-forager-text-muted">
              {APP_TAGLINE}
            </p>
          </div>
          <AuthButton />
        </div>
      </Page.Main>
    </Page>
  );
}
