import { WldBalanceChip } from '@/components/WldBalanceChip';
import { APP_NAME } from '@/lib/branding';
import { Marble } from '@worldcoin/mini-apps-ui-kit-react';

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
  username?: string;
  profilePictureUrl?: string;
};

export function AppHeader({
  title = APP_NAME,
  subtitle,
  username,
  profilePictureUrl,
}: AppHeaderProps) {
  const avatarInitial = username?.trim()?.charAt(0).toUpperCase() ?? 'F';

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="forager-display-lg truncate">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-[15px] leading-snug text-forager-text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <WldBalanceChip />
        {username ? (
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-[#1f1f1f] text-[12px] font-semibold text-foreground">
            {profilePictureUrl ? (
              <Marble src={profilePictureUrl} className="h-full w-full" />
            ) : (
              avatarInitial
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
