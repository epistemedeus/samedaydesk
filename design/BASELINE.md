# SameDayDesk baseline

Read 2026-11-17 from https://samedaydesk.com and from `main` at `162ae8cd`. Every design change
starts from this page. The keep list is binding: nothing on it is removed or restyled. Work is
added inside it. Selling rules for every word on a page: see `AGENTS.md`.

## Screenshots of the live site

`design/baseline/live-2026-11-17/`, full page, reduced motion, desktop 1440 and phone 390, the
drafting (light) and dark themes:

| Page | Files |
| --- | --- |
| Homepage | `home-{desk,phone}-{drafting,dark}.jpg` |
| x402 catalogue | `x402-…` |
| For agents | `for-agents-…` |
| Seller conformance | `x402_seller-conformance-…` |
| Terms (a stub today) | `terms-…` |

## Keep list

| Part | What it is | Where |
| --- | --- | --- |
| Themes | Dark "Engineered Speed": `#0a0b0d` with one lime `#ccff00`. Light "Drafting Table": bone `#f4f1ea`, graphite ink, one oxide red `#9e3b2e`. Stored as `sdd-theme` | `client/src/styles/tokens.css`, `drafting.css` |
| Type | Space Grotesk display, Inter text, JetBrains Mono labels | `tokens.css` |
| Drafting frame | Registration crosses at the page corners, grid paper behind the content | `DraftingFrame.tsx` |
| The reticle | Concentric rings and a crosshair at the top right of the hero. The signature on the light theme | `Hero.tsx`, `drafting.css` |
| Energy surface | Shader surface behind the hero on the dark theme | `EnergySurface.tsx` |
| Headlines | Large two-tone headings, last phrase in the accent and underlined. "FIG. 01" mono section labels | `Hero.tsx`, `Proof.tsx`, `Services.tsx`, `HowItWorks.tsx`, `Guarantee.tsx` |
| Offers as cards | Four cards in two groups: name, large price, time, inclusions, button, "Best place to start" and "Best value" ribbons | `Services.tsx` |
| Proof card | Before and after pair with a pass badge | `Proof.tsx` |
| Harder problem band | The quote request band under the offers | `Services.tsx` |
| Nav and buttons | Pill navigation, payments pill, magnetic buttons | `Nav.tsx`, `MagneticButton.tsx` |
| Motion | GSAP + ScrollTrigger + SplitText + ScrambleText, reveal on scroll, Lenis smooth scrolling on desktop | `client/src/motion/` |

## Notes

- The signature-piece test (`tests/keep-list.test.mjs`) asserts the reticle and the drafting
  frame in the rendered homepage.
