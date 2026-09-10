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
  const avatarInitial = username?.trim()?.charAt(0).toUpperCase() ?? 'W';

  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="forager-display truncate">{title}</h1>
        {subtitle ? (
          <p className="mt-3 text-[15px] leading-snug text-forager-text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="mb-0.5 flex shrink-0 items-center gap-3">
        <WldBalanceChip />
        {username ? (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#2c2c2e] text-[13px] font-semibold text-foreground">
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
