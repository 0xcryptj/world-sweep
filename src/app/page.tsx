import { AppLogo } from '@/components/AppLogo';
import { Page } from '@/components/PageLayout';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { AuthButton } from '@/components/AuthButton';

export default function Home() {
  return (
    <Page>
      <Page.Main className="flex flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo size="lg" />
          <div className="space-y-2">
            <h1 className="app-title text-3xl font-semibold">{APP_NAME}</h1>
            <p className="app-subtitle max-w-xs text-sm">{APP_TAGLINE}</p>
          </div>
        </div>
        <AuthButton />
      </Page.Main>
    </Page>
  );
}
