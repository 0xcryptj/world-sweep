'use client';

import { PixelIcon } from '@/components/PixelIcon';
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
    <nav className="forager-footer z-30 flex items-stretch justify-around px-2 pt-2 pb-1">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              active ? 'font-semibold text-forager-purple' : 'text-forager-text-muted'
            }`}
          >
            <PixelIcon
              name={tab.icon}
              size={22}
              variant="light"
              className={active ? 'opacity-100' : 'opacity-80'}
            />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
