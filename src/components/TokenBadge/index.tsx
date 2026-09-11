import { IosIcon } from '@/components/IosIcon';
import { cn } from '@/lib/utils';

type TokenBadgeTone = 'verified' | 'pending' | 'native' | 'muted';

const toneClass: Record<TokenBadgeTone, string> = {
  verified: 'forager-token-badge-verified',
  pending: 'forager-token-badge-pending',
  native: 'forager-token-badge-native',
  muted: 'forager-token-badge-muted',
};

export function TokenBadge({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: TokenBadgeTone;
  icon?: boolean;
}) {
  return (
    <span className={cn('forager-token-badge', toneClass[tone])}>
      {icon ? <IosIcon name="check" size={11} filled /> : null}
      {label}
    </span>
  );
}
