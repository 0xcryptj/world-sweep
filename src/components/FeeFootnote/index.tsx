import { PLATFORM_FEE_PERCENT } from '@/lib/constants';

/** Single quiet disclosure — keep off previews, banners, and store-style copy. */
export function FeeFootnote() {
  return (
    <p className="forager-fee-footnote">
      {PLATFORM_FEE_PERCENT}% fee · includes token foraging
    </p>
  );
}
