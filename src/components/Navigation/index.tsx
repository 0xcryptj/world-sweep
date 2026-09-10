'use client';

import { IosIcon } from '@/components/IosIcon';
import { hapticSelection } from '@/lib/haptics';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/home', label: 'Home', icon: 'home' as const },
  { href: '/wallet', label: 'Wallet', icon: 'wallet' as const },
  { href: '/profile', label: 'Profile', icon: 'user' as const },
];

export const Navigation = () => {
  const pathname = usePathname();

  return (
    <nav className="z-30 flex h-[var(--forager-nav-height)] items-stretch justify-around px-2">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            onClick={() => {
              void hapticSelection();
              if (tab.href === '/wallet') {
                requestWalletRefresh({ reason: 'nav' });
              }
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-medium tracking-[0.12px] ${
              active ? 'forager-tab-active' : 'forager-tab'
            }`}
          >
            <IosIcon name={tab.icon} size={25} filled={active} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
