# Frontend refresh: what shipped

Date: 2026-06-20. Built from the research in this folder (see `00-SYNTHESIS-PLAYBOOK.md`).
Verified with tsc, the production build, and live screenshots of both themes on desktop and mobile.

## 1. Smoke background flicker, fixed

`client/src/components/EnergySurface.tsx`. Two root causes removed:

- Time teleport on resume: the shader read the absolute rAF clock, so the IntersectionObserver / tab-visibility pause then resume jumped time forward in one frame. Now it accumulates its own delta-time (clamped to 0.05s, reset on resume, wrapped at 1000) so it never teleports.
- Brightness flash on scroll: scroll velocity drove both speed AND alpha. Velocity now nudges only the drift speed; alpha is near-constant. Velocity is a clamped target chased with frame-rate-independent damping, plus an interleaved-gradient dither to kill banding under the screen blend. Live `prefers-reduced-motion` and a dpr floor added.

## 2. Em-dashes and weak copy removed

- Zero em-dash characters anywhere in `src` or `index.html` (grep-guarded).
- Deleted: the hero trust bullets (money-back / same-day / registered US company), the Guarantee marks list (100% money-back / free revision / pay after sample), and "every order reviewed by a human before it reaches you".
- Removed all AI/human framing from copy; focus is on the work.

## 3. "Drafting Table" light theme + accessible toggle

A genuine second design, not an inversion: warm-bone paper, graphite hairline grid, oversized
grotesque headers, a single scarce oxide-red annotation accent, editorial plate numbers
(FIG. 01..04), corner registration crop marks, and a large registration target standing in for
the smoke in the hero.

- `tokens.css`: `[data-theme="drafting"]` re-binds the token palette (bone `#F4F1EA`, graphite `#1A1A1A`, oxide-red `#9E3B2E` onto the `--lime` signal slot) so every token-driven component re-skins for free. All text colors clear WCAG AA on bone.
- `styles/drafting.css`: the decorative layer (grid, plate numbers, oversized headers, oxide annotations, paper grain).
- `lib/theme.tsx`: ThemeProvider + useTheme, persists to `localStorage` (`sdd-theme`), View Transitions circular reveal from the toggle (feature-detected, reduced-motion safe), per-theme `meta[theme-color]`.
- `index.html`: synchronous no-FOUC inline script sets `data-theme` + ground color before first paint. Default is dark (brand-first).
- `components/ThemeToggle.tsx` (in the nav): real `<button>` with `aria-pressed` + action label.
- `components/DraftingFrame.tsx`: the corner registration marks, mounted only under the paper theme.
- The shader does not run under the paper theme.

## 4. Favicon + logo (light and dark)

- `components/BrandMark.tsx`: the in-app "Same-Day Stamp" (accent tile + knockout chevron), token-driven so it themes itself; replaces the old `▸▸` glyph in the nav and footer.
- `public/favicon.svg`: theme-adaptive (oxide stamp on light browser chrome, lime stamp on dark).
- Complete icon set in `public/`: `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `site.webmanifest`.
- Profile pictures (light + dark) ready to upload in `client/brand/export/`. See `client/brand/README.md`.

## Known follow-up (not done, out of scope unless you want it)

- `public/og.png` is a static social-share image with the old tagline baked in. Regenerate it if you want the social preview to match the new copy.
