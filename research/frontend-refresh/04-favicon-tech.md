# Definitive 2025-2026 Favicon + App-Icon Setup for SameDayDesk (Vite), with Theme-Adaptive SVG

_Research report for the SameDayDesk frontend refresh (2026-06-20). Area: favicon-tech._

## Key takeaways

- The genuinely-required modern set is just 5 files: icon.svg (theme-adaptive), favicon.ico (32x32 fallback for legacy + Google), apple-touch-icon.png (180x180), and two PNGs in the manifest (192 'any' + 512 'maskable'). Everything beyond that (the old 20-file pile from 2015-era generators) is cargo cult.
- SameDayDesk already has icon.svg + theme-color but is MISSING: favicon.ico fallback, apple-touch-icon, the web app manifest, and the dark-mode media query inside the SVG. Four concrete gaps to close.
- A theme-adaptive SVG favicon works by embedding `<style>` with `@media (prefers-color-scheme: dark){...}` directly inside the .svg file. It changes the favicon based on the OS/browser theme, not the page's own data-theme.
- Caveat: the SVG media query keys off the OS color scheme (browser chrome), NOT your page background, and NOT your site's [data-theme]. Safari historically ignores it; browsers cache favicons aggressively so changes need a hard refresh or a ?v= query-string bust.
- A favicon mark and a maskable app icon are different artifacts: the favicon can bleed to the edges (16-32px tab use), but the maskable icon must keep all important content inside a center circle of radius = 40% of width (a 409px-diameter safe circle on a 512px canvas); the outer 10% can be cropped by Android's adaptive-icon mask.
- Maskable icons must be fully opaque with a filled background and generous padding; a transparent or edge-to-edge logo will get clipped into a circle/squircle and look broken on Android home screens.
- theme-color stays at #0a0b0d (matches the dark brand and the existing anti-flash style); add a matching `background_color` in the manifest for the PWA splash.
- Rasterize one master SVG into all PNG sizes from the CLI with sharp (already npm-friendly): npx @resvg/resvg-js or `sharp-cli`. The report gives an exact command sequence to emit favicon-32, apple-touch-icon-180, icon-192, icon-512, and a padded maskable-512 plus the .ico.
- Use png-to-ico (or sharp + to-ico) to build favicon.ico; ImageMagick is the fallback but ships fuzzy 32px ICOs unless you feed it a clean 32 PNG.
- Note for grounding: the repo is actually on React 19 / Vite 8 (not React 18 as the brief states); none of that affects the favicon setup, which is pure static files in /public + tags in index.html.

---

## SameDayDesk: current state vs. target

Your `index.html` head today (from `/Users/plasmic/dev/web/samedaydesk/client/index.html`) already has two of the right pieces:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="theme-color" content="#0a0b0d" />
```

And `/Users/plasmic/dev/web/samedaydesk/client/public/favicon.svg` is a clean 32-viewBox double-chevron:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0a0b0d"/>
  <path d="M6.5 8.5 L15 16 L6.5 23.5 Z" fill="#ccff00"/>
  <path d="M15.5 8.5 L24 16 L15.5 23.5 Z" fill="#ccff00"/>
</svg>
```

What is **missing** for a complete 2025-2026 setup:

1. A `favicon.ico` (32x32) fallback for browsers that ignore SVG favicons and for Google Search results (Google does not use SVG favicons in SERPs).
2. An `apple-touch-icon.png` at 180x180 (iOS home-screen / Safari).
3. A web app manifest with a 192 icon, a 512 icon, and a **maskable** 512 icon.
4. The dark-mode `@media` block inside the SVG so the mark adapts to the OS theme.

(Side note for accuracy: the working tree is actually React 19 / Vite 8 per `package.json`, not React 18. Irrelevant to favicons, which are static files in `public/` plus tags in `index.html`, but worth flagging since the brief said React 18.)

---

## 1. The minimal-but-complete set: required vs. cargo cult

The modern consensus (evilmartians "How to Favicon", realfavicongenerator) is that you need **five files**, not the twenty-plus that 2015-era generators emitted:

| File | Size | Purpose | Required? |
|---|---|---|---|
| `favicon.svg` (or `icon.svg`) | vector | Primary favicon, theme-adaptive, sharp at any DPI | Yes (your primary) |
| `favicon.ico` | 32x32 | Fallback for SVG-less browsers + Google SERP favicon | Yes |
| `apple-touch-icon.png` | 180x180 | iOS home screen, Safari pinned | Yes |
| `icon-192.png` | 192x192 | Manifest, Android "any" icon | Yes |
| `icon-512-maskable.png` | 512x512 | Manifest, Android adaptive/maskable | Yes |
| `manifest.webmanifest` | - | PWA / Android install metadata | Yes |

What is **cargo cult** and can be dropped:

- The old pile of `apple-touch-icon-57x57` ... `-152x152` variants. A single 180x180 covers all current iOS devices.
- `mstile-*.png` and `browserconfig.xml` (Windows 8/10 pinned tiles). Dead. Microsoft retired the Start-menu tile program.
- `favicon-16x16.png` and `favicon-32x32.png` as separate PNGs. The SVG plus the .ico cover these; the .ico can itself embed 16 and 32 if you care, but a single 32 is fine.
- A separate non-maskable 512 PNG is optional. You can ship one 512 with `"purpose": "any maskable"` if your art has enough padding, but the cleaner approach is one tight 192/512 "any" and one padded 512 "maskable" (see section 3).

Sources: evilmartians "How to Favicon in 2021/2025: Six files that fit most needs" (https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs), realfavicongenerator (https://realfavicongenerator.net/blog/how-to-create-an-svg-favicon).

---

## 2. Theme-adaptive SVG favicon (working example)

An SVG favicon can carry its own `<style>` with a `prefers-color-scheme` media query. The browser evaluates it against the **OS / browser color scheme**, then renders the right colors in the tab. Here is a complete, working version of your double-chevron that inverts cleanly between light and dark UI:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>
    /* default = LIGHT browser UI: dark rounded tile, lime chevrons */
    .tile { fill: #0a0b0d; }
    .mark { fill: #ccff00; }

    @media (prefers-color-scheme: dark) {
      /* DARK browser UI: drop the tile to transparent so the
         lime mark sits directly on the dark browser chrome */
      .tile { fill: transparent; }
      .mark { fill: #ccff00; }
    }
  </style>
  <rect class="tile" width="32" height="32" rx="7"/>
  <path class="mark" d="M6.5 8.5 L15 16 L6.5 23.5 Z"/>
  <path class="mark" d="M15.5 8.5 L24 16 L15.5 23.5 Z"/>
</svg>
```

Two common patterns, pick one:

- **Re-color elements** (above): give shapes classes, override `fill` under the dark media query. Most control, recommended for a 2-color mark like yours.
- **Brightness filter** (realfavicongenerator's lazy default): wrap with `@media (prefers-color-scheme: dark){ :root { filter: brightness(2); } }`. Good for photographic/complex logos, needs trial-and-error on the factor. Overkill here.

### Browser support and caveats (important)

- **`prefers-color-scheme`** is supported in ~91% of browsers; **SVG favicons** themselves in ~74% (caniuse). That gap is exactly why you still ship a `.ico` fallback.
- **The media query reflects the OS color scheme (browser chrome), not your page.** `prefers-color-scheme: dark` does **not** mean the favicon is painted on a dark surface, and it has nothing to do with your site's own `[data-theme]` attribute. Design for "what color is the browser UI," not "what color is my page." (CSS-Tricks, "SVG Favicons in Action": https://css-tricks.com/svg-favicons-in-action/)
- **Safari** historically does not honor the media query in favicons (and uses `mask-icon`/pinned-tab behavior differently). Chrome and Firefox do honor it.
- **Aggressive caching.** Browsers cache favicons hard. After you change the SVG, a normal reload often will not pick it up. Force it with a versioned href during deploys: `href="/favicon.svg?v=2"`. Some browsers also re-evaluate the media query live on theme switch; others only on reload. Do not rely on instant live switching.
- Keep the SVG tiny and self-contained: inline `<style>`, no external refs, no scripts (favicons render in a restricted context).

Sources: CSS-Tricks "SVG Favicons in Action" (https://css-tricks.com/svg-favicons-in-action/), realfavicongenerator "How to create an SVG favicon" (https://realfavicongenerator.net/blog/how-to-create-an-svg-favicon).

---

## 3. Maskable safe zone, and favicon-mark vs. maskable-app-icon

These are two different artifacts and conflating them is the #1 mistake:

- **Favicon mark** (`favicon.svg`, `favicon.ico`): rendered tiny (16-32px) in browser tabs/bookmarks. It can bleed to the edges; a tight, high-contrast mark reads best at 16px. Your double-chevron is correct for this.
- **Maskable app icon** (`icon-512-maskable.png`): rendered large on Android home screens, where the OS **clips it into a platform shape** (circle, squircle, rounded square, teardrop) via an adaptive-icon mask. Anything near the edge gets cut.

### The safe zone (exact numbers)

Per the W3C spec and web.dev "Maskable icons" (https://web.dev/articles/maskable-icon):

> The important parts of your icon, such as your logo, must be within a circular area in the center of the icon with a **radius equal to 40% of the icon width**. The outer 10% edge might be cropped on some platforms.

Concretely, on a **512px** canvas:

- Safe circle = radius 40% x 512 = ~205px radius, i.e. a **~409px-diameter** centered circle.
- Keep your mark inside roughly the **center 80%** (the keyline); treat the outer ~51px ring on each side as droppable.
- The icon must be **fully opaque** with a solid filled background (no transparency), so the mask has something to crop into. A transparent edge-to-edge logo will look chopped.

Practical recipe for your brand: a 512 canvas filled `#0a0b0d`, with the lime double-chevron scaled to occupy roughly the center 60-70% so it never approaches the keyline. Verify in maskable.app (drop the PNG, cycle the masks).

Source: web.dev "Maskable icons" (https://web.dev/articles/maskable-icon); MDN manifest `icons` member, which documents `purpose: any | maskable | monochrome` (https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons).

---

## 4. Exact `index.html` head tags

Replace the single favicon line in `/Users/plasmic/dev/web/samedaydesk/client/index.html` with this block. Order matters only slightly; the `sizes="32x32"` on the `.ico` is a deliberate fix for an old Chrome bug where Chrome would otherwise prefer the ICO over the SVG.

```html
<!-- Favicons / app icons -->
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />

<!-- Browser UI color (matches dark brand + your anti-flash style) -->
<meta name="theme-color" content="#0a0b0d" />
```

Notes:
- You already set `theme-color` to `#0a0b0d`; keep it. It tints the browser UI on mobile Chrome/Android and matches your `html { background:#0a0b0d }` anti-flash rule.
- You can optionally split theme-color by scheme, though for an all-dark brand it is unnecessary:
  ```html
  <meta name="theme-color" content="#0a0b0d" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#0a0b0d" media="(prefers-color-scheme: light)" />
  ```
- Files live in `/Users/plasmic/dev/web/samedaydesk/client/public/` so Vite serves them at the web root (`/favicon.ico`, etc.) and copies them into `dist/` untouched.

---

## 5. `site.webmanifest` example

Create `/Users/plasmic/dev/web/samedaydesk/client/public/site.webmanifest`:

```json
{
  "name": "SameDayDesk",
  "short_name": "SameDayDesk",
  "description": "Same-day, done-for-you resumes, LinkedIn, cover letters and copy.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0a0b0d",
  "theme_color": "#0a0b0d",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Field notes (web.dev / MDN):
- `name` / `short_name`: full and home-screen label.
- `start_url` + `scope`: `/` for a single-domain SPA.
- `display: "standalone"`: opens chrome-less when installed; use `"browser"` if you do not want app-like install behavior.
- `background_color`: the install splash background (set to your `#0a0b0d` so there is no white flash on launch, mirroring your inline style).
- `theme_color`: should match the `<meta name="theme-color">`.
- `icons`: the **maskable** entry is separate from the **any** entries on purpose, because the maskable art has extra padding and the "any" art is tight. Specifying `type` lets browsers skip formats they cannot use.

The `.webmanifest` extension is preferred over `.json` (correct `application/manifest+json` MIME); both work, but Vite/most hosts already map `.webmanifest`.

---

## 6. CLI pipeline: one SVG into every PNG + the .ico

You have **no rasterizer installed** in the repo (`node_modules/.bin` has no sharp/resvg, and `rsvg-convert`/`resvg` are not on PATH). Pick one of these. `sharp` is the cleanest fit for a Node/Vite project.

### Option A: sharp via `sharp-cli` (recommended, pure npm, no native system deps beyond sharp's prebuilt binaries)

Make a tight master `icon-master.svg` (your mark, edge-to-edge) and a padded `icon-maskable.svg` (mark inside the center ~65%, `#0a0b0d` background filling the 512 canvas). Then:

```bash
# from client/
npm i -D sharp-cli png-to-ico

# Tight "any" icons + apple touch icon, all rasterized from the master SVG
npx sharp-cli -i public/icon-master.svg -o public/apple-touch-icon.png resize 180 180
npx sharp-cli -i public/icon-master.svg -o public/icon-192.png         resize 192 192
npx sharp-cli -i public/icon-master.svg -o public/icon-512.png         resize 512 512

# 32px PNG to feed the .ico
npx sharp-cli -i public/icon-master.svg -o public/favicon-32.png       resize 32 32

# Padded maskable (separate source SVG with built-in safe-zone padding)
npx sharp-cli -i public/icon-maskable.svg -o public/icon-512-maskable.png resize 512 512

# Build favicon.ico from the 32 PNG
npx png-to-ico public/favicon-32.png > public/favicon.ico
rm public/favicon-32.png

# Keep your theme-adaptive SVG as-is (this is your primary)
# public/favicon.svg  <-- the @media version from section 2
```

### Option B: resvg (Rust, very accurate SVG rendering) via `@resvg/resvg-js`

```bash
npm i -D @resvg/resvg-js png-to-ico
# resvg-js is a library; the one-liners above with sharp are simpler for batch CLI.
# Use resvg when sharp's librsvg-free renderer mishandles a font or filter.
```

### Option C: system `rsvg-convert` (if you install librsvg via Homebrew)

```bash
brew install librsvg pngquant
rsvg-convert -w 180 -h 180 public/icon-master.svg   -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 public/icon-master.svg   -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/icon-master.svg   -o public/icon-512.png
rsvg-convert -w 512 -h 512 public/icon-maskable.svg -o public/icon-512-maskable.png
rsvg-convert -w 32  -h 32  public/icon-master.svg   -o public/favicon-32.png
npx png-to-ico public/favicon-32.png > public/favicon.ico && rm public/favicon-32.png
```

### Option D: zero-effort, one upload (realfavicongenerator)

Drop `icon-master.svg` into https://realfavicongenerator.net, it emits exactly this minimal set plus the copy-paste HTML and manifest. Good sanity check / fallback; the CLI options above keep it reproducible in your build.

ImageMagick (`magick`/`convert`) can also produce the .ico (`magick favicon-32.png favicon.ico`) but tends to ship fuzzy results unless you hand it a clean 32px PNG, so prefer `png-to-ico`.

---

## Net change list for SameDayDesk

1. Edit `public/favicon.svg` -> add the `<style>` + `@media (prefers-color-scheme: dark)` block (section 2).
2. Add `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png` (section 6 pipeline).
3. Add `public/site.webmanifest` (section 5).
4. Swap the head block in `index.html` to the five-line set (section 4); keep your existing `theme-color`.

That is the full, non-cargo-cult 2025-2026 setup.

## Sources

- https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs
- https://realfavicongenerator.net/blog/how-to-create-an-svg-favicon
- https://css-tricks.com/svg-favicons-in-action/
- https://web.dev/articles/maskable-icon
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons
- https://realfavicongenerator.net
- https://maskable.app/editor
