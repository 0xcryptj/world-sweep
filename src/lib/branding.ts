import { withBasePath } from './base-path';

export const APP_NAME = 'Forager';

/** Brand voice — field-ledger, careful notes */
export const APP_TAGLINE = 'Turn leftover World Chain tokens into WLD.';

export const APP_DESCRIPTION =
  'Forager finds leftover World Chain tokens that still have liquidity, then batches them into one swap back to WLD. You pick what to forage, preview the route and fee, and approve in World App.';

/** Store listing copy — apply in Developer Portal after review unlocks edits. */
export const STORE_LISTING_COPY = {
  worldAppDescription: 'Turn junk World Chain tokens into WLD',
  worldAppButtonText: 'Forage junk',
  descriptionOverview: APP_DESCRIPTION,
  descriptionHowItWorks:
    '1. Sign in with World App. 2. Forager scans your wallet for junk ERC-20s with real Uniswap liquidity to WLD. 3. Select tokens, preview estimated WLD (5% platform fee). 4. Approve the batched swap in World App.',
  descriptionConnect:
    'Open Forager inside World App, connect your wallet, and forage whenever mini-app airdrops leave tokens sitting idle.',
} as const;
export const APP_LOGO_SRC = withBasePath('/assets/pics/forager-logo.png');

/**
 * World Chain × Promotor Wow — black canvas, white primary, no blue.
 */
export const FORAGER_COLORS = {
  ink: '#000000',
  ink2: '#0f0f0f',
  ink3: '#1f1f1f',
  hair: '#2e2e2e',
  hair2: '#3d3d3d',
  bone: '#ffffff',
  boneDim: '#a3a3a3',
  moss: '#737373',
  forager: '#ffffff',
  foragerDeep: '#d4d4d4',
  brass: '#f5f5f5',
  brassDim: '#a3a3a3',
} as const;

export const BRAND_COPY = {
  forageSuccess: "Ledger closed. Value's in your wallet.",
  foragePending: 'Converting leftover tokens · awaiting your sign-off',
  globalReclaimed: 'Total reclaimed',
  worldChain: 'WORLD CHAIN',
  shareCta: 'Share this forage',
  inviteCta: 'Invite foragers',
} as const;
