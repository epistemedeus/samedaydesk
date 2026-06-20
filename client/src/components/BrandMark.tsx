// SameDayDesk mark: the "Same-Day Stamp". A rounded-square dispatch tile with a knockout
// double-chevron (fast-forward = same-day speed). One geometry, both themes: the tile fills
// with the accent (lime on dark, oxide on bone) and the chevron knocks out to the ground
// color. Identical path data everywhere proves it is one mark. Decorative: the wordmark
// beside it carries the accessible name, so this is aria-hidden.
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="bm-tile" x="6" y="6" width="88" height="88" rx="20" />
      <path className="bm-chev" d="M33 29 L51 50 L33 71 Z" />
      <path className="bm-chev" d="M53 29 L71 50 L53 71 Z" />
    </svg>
  );
}
