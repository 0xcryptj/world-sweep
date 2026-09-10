import { withBasePath } from './base-path';

export const PIXEL_ICONS = {
  home: withBasePath('/assets/pics/home.svg'),
  wallet: withBasePath('/assets/pics/wallet.svg'),
  user: withBasePath('/assets/pics/user.svg'),
  swap: withBasePath('/assets/pics/swap.svg'),
  coin: withBasePath('/assets/pics/coin.svg'),
} as const;

export type PixelIconName = keyof typeof PIXEL_ICONS;
