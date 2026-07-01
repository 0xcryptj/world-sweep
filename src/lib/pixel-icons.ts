export const PIXEL_ICONS = {
  home: '/assets/pics/home.svg',
  wallet: '/assets/pics/wallet.svg',
  user: '/assets/pics/user.svg',
  swap: '/assets/pics/swap.svg',
  coin: '/assets/pics/coin.svg',
} as const;

export type PixelIconName = keyof typeof PIXEL_ICONS;
