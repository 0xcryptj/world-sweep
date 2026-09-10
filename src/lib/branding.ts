import { withBasePath } from './base-path';

export const APP_NAME = 'Forager';

/** Brand voice — field-ledger, careful notes */
export const APP_TAGLINE = 'Turn junk World Chain tokens into WLD.';

export const APP_DESCRIPTION =
  'Forager finds leftover junk tokens in your World Chain wallet that still have liquidity, then batches them into one swap back to WLD. You pick what to forage, preview the route and fee, and approve in World App.';

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
 * Forager × World brand tokens — from forager-world-brand.html
 * Green = tool/action · Brass = recovered value (flat, no glow)
 */
export const FORAGER_COLORS = {
  ink: '#0b0c0b',
  ink2: '#131512',
  ink3: '#191c17',
  hair: '#2b2f27',
  hair2: '#3a4034',
  bone: '#ece7db',
  boneDim: '#9a9c90',
  moss: '#6f9070',
  forager: '#4cee8c',
  foragerDeep: '#2a8f56',
  brass: '#c9a24b',
  brassDim: '#8a7440',
} as const;

export const BRAND_COPY = {
  forageSuccess: "Ledger closed. Value's in your wallet.",
  foragePending: 'Converting junk tokens · awaiting your sign-off',
  globalReclaimed: 'Total reclaimed',
  worldChain: 'WORLD CHAIN',
  shareCta: 'Share this forage',
  inviteCta: 'Invite foragers',
} as const;
