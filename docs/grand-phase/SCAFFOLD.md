# SameDayDesk: what the grand phase leaves for the finishing builder

Branches: `grand-phase/quick-start` (the block in the present style and `/start.md`),
`grand-phase/design` (the redesign), `grand-phase/scaffold` (machine files and this note).
Nothing is released; the redesign waits for the one sitting.

## Left

- **Command line tab.** The SameDayDesk CLI is not served anywhere and its package is
  `UNLICENSED`, so the tab shows the free route check over HTTP
  (`curl -s "https://samedaydesk.com/api/tools/ai-readiness?url=..."`). When the CLI is released
  under the shared grammar (F3), replace that line in `client/src/data/quickstart.ts` and in
  `client/public/start.md` together.
- **Three further offers** (Agent Front Door 249 USD, Keep it working 100 USD a month, crawler
  access check free) are shown on the design branch with "Ask at contact@samedaydesk.com.
  Ordering opens after review." Their checkout products are not created; they go to the sitting.
- **Proof strip** reads `/api/proof` (five-minute cache of the gateway's health record) and falls
  back to the dated snapshot in `client/src/data/proof-snapshot.ts`. Refresh the snapshot at
  release.
- **Lenis is removed** on the design branch: native scrolling only, because the motion rules
  forbid scroll hijacking and the reveals are CSS scroll-driven. GSAP stays for the pieces that
  still use it.

## Tests that cover this work

`npm run build`; lint and typecheck on changed files; `server/scripts/test-spa-fallback.js` and
`server/scripts/test-machine-discovery-journey.js` (6/6).
