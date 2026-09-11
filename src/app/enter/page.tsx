import { ForagerHeroMark } from '@/components/ForagerHeroMark';
import { Page } from '@/components/PageLayout';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { AuthButton } from '@/components/AuthButton';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { Ripple } from '@/components/ui/ripple';
import { SparklesText } from '@/components/ui/sparkles-text';

export default function EnterPage() {
  return (
    <Page className="relative z-10">
      <div className="forager-splash-wash" />
      <div className="forager-saas-grid pointer-events-none absolute inset-0" />
      <Page.Main className="relative z-10 flex flex-col items-center justify-center py-10">
        <div className="flex w-full max-w-[22rem] flex-col items-center gap-8 text-center">
          <div className="relative grid h-[13.5rem] w-[13.5rem] place-items-center">
            <Ripple mainCircleSize={120} mainCircleOpacity={0.18} numCircles={5} />
            <ForagerHeroMark animated size={168} />
          </div>
          <div className="flex flex-col items-center gap-3">
            <SparklesText sparklesCount={5} className="forager-display">
              {APP_NAME}
            </SparklesText>
            <p className="max-w-[18rem] text-[17px] leading-snug text-forager-text-muted">
              {APP_TAGLINE}
            </p>
            <AnimatedShinyText className="text-[12px] tracking-[0.18em] text-white/50 uppercase">
              World App mini app
            </AnimatedShinyText>
          </div>
          <AuthButton />
        </div>
      </Page.Main>
    </Page>
  );
}
