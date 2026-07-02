import { AppLogo } from '@/components/AppLogo';
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
  subtitle = 'Token swap utility',
  username,
  profilePictureUrl,
}: AppHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <AppLogo size="sm" />
        <div>
          <p className="app-title text-lg font-semibold">{title}</p>
          <p className="app-subtitle text-xs">{subtitle}</p>
        </div>
      </div>
      {username ? (
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold capitalize text-foreground">
            {username}
          </p>
          {profilePictureUrl ? (
            <Marble src={profilePictureUrl} className="w-12" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
