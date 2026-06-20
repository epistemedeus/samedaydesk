# Implementation Playbook (synthesis)

_SameDayDesk frontend refresh, 2026-06-20. Decisive plan synthesized from the five research reports in this folder._

## Key decisions

- Default theme stays DARK 'Engineered Speed' on first visit; brand-first, only honor prefers-color-scheme when the saved choice is explicitly 'system'.
- Light theme named [data-theme="drafting"] (not generic 'light') to keep its strong identity self-contained; toggle flips dark <-> drafting.
- Drafting-Table light palette (exact hex): --bg #F4F1EA bone, --bg-1 #F7F4EC ivory, --bg-2 #EDE8DC oat, --ink #1A1A1A (15.4:1), --ink-dim #55524C (6.9:1), accent oxide-red #9E3B2E (5.97:1, AA), hairlines --line #C9C4B8 / --line-2 #BBB6AA.
- Re-bind the existing --lime 'signal' token slot to oxide-red #9E3B2E under the drafting theme so token-driven components re-skin for free; oxide-red is scarce annotation-only, never body copy.
- Dark palette confirmed unchanged: bg #0a0b0d, ink #f4f4f0, lime #ccff00.
- Logo: ONE concept chosen — 'Same-Day Stamp', a double-chevron inside a rounded-square stamp tile, authored as filled SVG on a 0 0 100 100 grid with currentColor; identical path data in both themes (lime-on-black dark, oxide-on-bone drafting).
- WebGL fix: own accumulated delta-time clock with lastFrame=0 reset on resume + dt clamp to 0.05s (kills time teleport); decouple alpha from velocity (alpha 0.18 + 0.04*uVel, speed gets the velocity); frame-rate-independent 1-exp(-lambda*dt) damping; IGN dither before output; wrap uTime % 1000.
- No-FOUC via a synchronous inline <head> script that sets data-theme + color-scheme before first paint; React state initializes from the DOM attribute, never a hardcoded literal.
- Toggle is a real <button> with aria-pressed (not role=switch), View Transitions circular reveal as progressive enhancement gated behind feature-detection + prefers-reduced-motion, with the disable-transitions-during-switch fallback.
- Shader disabled under the drafting theme (host early-returns) so the paper aesthetic stays still.
- Favicon: complete the non-cargo-cult 5-file set (svg theme-adaptive + ico + apple-touch-180 + 192 + 512 maskable) plus site.webmanifest; generate rasters from one master SVG via sharp-cli + png-to-ico.
- Zero em-dash characters: rewrite index.html title/description/OG/twitter copy with colons and commas, and grep-guard src + index.html before commit.

---

# SameDayDesk Implementation Playbook

One pass, four shipments: (1) fix the WebGL smoke flicker, (2) scrub em-dashes and weak copy, (3) build the "Drafting Table" light theme with a no-FOUC accessible toggle, (4) ship a real favicon + logo for both themes. Everything is grounded in the actual files I read: `EnergySurface.tsx`, `EnergySurface.module.css`, `tokens.css`, `Nav.tsx`, `Nav.module.css`, `index.html`, `public/favicon.svg`. Stack confirmed: React 19.2, Vite 8, ogl 1.0.11; `public/` currently holds only `favicon.svg` and `og.png`.

A note on scope discipline: the theme swap is real and low-risk because the codebase is already token-driven (every component reads `var(--bg)`, `var(--ink)`, `var(--lime)`, `var(--line)`). The light theme is a token re-bind plus drafting-only decorative CSS, not a component rewrite.

---

## PART 1 — Fix the WebGL smoke flicker (EnergySurface)

Four root causes, all confirmed at the cited lines in `/Users/plasmic/dev/web/samedaydesk/client/src/components/EnergySurface.tsx`.

### 1a. The time teleport (the snap on resume) — the #1 bug

Line 112 sets `uTime = t * 0.001` where `t` is the rAF timestamp (same clock as `performance.now()`). While the IntersectionObserver or `visibilitychange` pauses the loop (lines 120, 124), that clock keeps advancing in the real world, so the first frame after resume jumps `uTime` forward by the entire paused interval. The fbm domain warp (lines 32 to 34) lurches to a new state in one frame.

Fix: accumulate your own delta-time clock and discard the gap on resume. Replace the `loop`/`play`/`pause` block (lines 109 to 120):

```ts
let raf = 0;
let running = false;
let elapsed = 0;     // animation time; only advances while visible
let lastFrame = 0;   // 0 = needs re-seed (set on every play())

const loop = (t: number) => {
  if (lastFrame === 0) lastFrame = t;          // seed, contribute 0 dt
  const dt = Math.min(0.05, (t - lastFrame) * 0.001); // clamp slips/resume slip
  lastFrame = t;
  elapsed += dt;

  // wrap so fbm coordinates never grow unbounded (hash precision guard, 1d below)
  program.uniforms.uTime.value = elapsed % 1000.0;

  // velocity: frame-rate-independent exponential damping (1b)
  velTarget *= Math.exp(-3.0 * dt);            // target eases back to rest
  const u = program.uniforms.uVel.value as number;
  const k = 1 - Math.exp(-6.0 * dt);           // lambda = 6, same feel at 60/120Hz
  program.uniforms.uVel.value = u + (velTarget - u) * k;

  renderer.render({ scene: mesh });
  raf = requestAnimationFrame(loop);
};
const play  = () => { if (!running) { running = true; lastFrame = 0; raf = requestAnimationFrame(loop); } };
const pause = () => { if (running)  { running = false; cancelAnimationFrame(raf); } };
```

The two load-bearing lines are `lastFrame = 0` in `play()` (drops the paused gap) and `Math.min(0.05, ...)` (caps any residual slip to ~3 frames).

### 1b. The brightness flash from scroll velocity

`uVel` currently drives BOTH the flow speed (line 32) AND the alpha (line 39: `0.16 + 0.30 * uVel`), so a fast scroll nearly triples layer alpha and flashes through the `screen` blend. The scroll handler also holds the peak (line 62, `Math.max(vel, ...)`) and decays per-frame (lines 114 to 115), which is frame-rate dependent.

Decouple: velocity may nudge time-scale but must NOT swing brightness. Replace the scroll-handler state (lines 54 to 65) so it writes a clamped raw target rather than jamming the live value:

```ts
let velTarget = 0;
let lastY = window.scrollY;
let lastT = performance.now();

const onScroll = () => {
  const now = performance.now();
  const dy = Math.abs(window.scrollY - lastY);
  const dtMs = Math.max(16, now - lastT);
  velTarget = Math.min(1.0, (dy / dtMs) * 6);   // clamp; do NOT Math.max old value
  lastY = window.scrollY;
  lastT = now;
};
```

Delete the old `let vel = 0;` and the `vel = Math.min(1.4, Math.max(...))` line; the damping now lives in `loop` (shown in 1a). Note: the old `program.uniforms.uVel.value` chase used `u + (vel - u) * 0.06` and `vel *= 0.92`; both are gone.

### 1c. Shader corrections (the GLSL string, lines 12 to 42)

Three edits: wrap time, decouple alpha from velocity, add dither before output.

```glsl
void main(){
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = uv; p.x *= aspect;

  float t = uTime * (0.05 + uVel * 0.18);   // velocity nudges SPEED only
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
  float f = fbm(p + 1.7 * q + vec2(t * 0.5, -t * 0.3));
  float bands = smoothstep(0.34, 0.78, f);
  vec3 lime = vec3(0.80, 1.0, 0.0);
  vec3 col = lime * bands;
  float mask = smoothstep(1.15, 0.15, distance(uv, vec2(0.80, 0.86)));

  float a = bands * mask * (0.18 + 0.04 * uVel);  // alpha ~constant; vel <= +0.04

  // Interleaved Gradient Noise (Jimenez): zero-mean +/-0.5 LSB dither kills banding
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float d = (ign - 0.5) / 255.0;
  col += d;
  a = clamp(a + d, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
```

`uTime` is already wrapped with `% 1000.0` in JS (1a), so the `hash()` at line 19 stays in a stable float range and cannot collapse into sparkle/NaN over a long session. Keep `precision highp float` (line 13).

### 1d. CSS amplitude (reduce the screen-blend magnification)

In `/Users/plasmic/dev/web/samedaydesk/client/src/components/EnergySurface.module.css`, the `.canvas` rule (lines 10 to 15) pairs `opacity: 0.6` with `mix-blend-mode: screen`, which magnifies residual quantization steps. With alpha now near-constant and dithered in-shader, raise the canvas opacity so the dither (not the blend) controls level:

```css
.canvas { position: absolute; inset: 0; opacity: 0.9; mix-blend-mode: screen; }
```

### 1e. Hardening (still in EnergySurface.tsx)

- dpr floor for shimmer-free backing store (line 84):
  `dpr: Math.min(1.5, Math.floor((window.devicePixelRatio || 1) * 2) / 2),`
- Live `prefers-reduced-motion`. Today line 48 checks `prefersReducedMotion()` once and bails, leaving a dead canvas. Instead, render ONE static frame and add a `change` listener that pauses/plays:
  ```ts
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onMotionPref = () => (mq.matches ? pause() : play());
  mq.addEventListener("change", onMotionPref);
  cleanups.push(() => mq.removeEventListener("change", onMotionPref));
  // if mq.matches at mount: renderer.render({ scene: mesh }) once, then do NOT start the loop
  ```
- Leave OGL defaults alone: continuous rAF is correct (IO + visibility gating already throttles offscreen), and do NOT enable `preserveDrawingBuffer`.
- Theme interaction: the shader is a dark-brand artifact. Under the light "Drafting Table" theme it fights the paper aesthetic, so the host gates it off (see Part 3, the `<EnergySurface>` mount should early-return when `data-theme === "drafting"`).

---

## PART 2 — Remove em-dashes and weak marketing copy

No em-dash characters anywhere in shipped copy or code comments. Replace with commas, colons, or parentheses, and recast the listy phrases.

`/Users/plasmic/dev/web/samedaydesk/client/index.html` contains em-dashes in the `<title>` and meta descriptions. Concrete rewrites:

- `<title>`: `SameDayDesk: hand off the busywork, get it back today`
- `meta[name=description]`: `A same-day, done-for-you desk for resumes, LinkedIn, cover letters, landing-page copy and quick fixes. Rewritten by sharp humans plus AI and delivered in hours. See the quality free, first. Money-back guaranteed.`
- `og:title` / `twitter:title`: `SameDayDesk: hand off the busywork, get it back today`
- `og:description` / `twitter:description`: `Same-day, done-for-you resumes, LinkedIn, cover letters and copy, delivered in hours. See the quality free, first. Money-back guaranteed.`

Also scrub the comment on `EnergySurface.module.css` line 8 (it currently uses no em-dash, leave it) and grep the whole `src/` tree and `index.html` for the character before committing:

```bash
grep -rn "—" client/src client/index.html || echo "clean"
```

Copy tone: keep the claims that are real and operational (same-day, money-back, see-quality-free) and cut filler. Do not invent new guarantees.

---

## PART 3 — The "Drafting Table" light theme (Swiss-editorial)

A LIGHT theme that is a deliberate counterpart to dark "Engineered Speed," not an inversion: warm-bone paper, graphite hairline grid, a single oxide-red annotation accent, oversized Space Grotesk. It re-binds the existing token names under `[data-theme="drafting"]` so every component re-skins for free, then layers drafting-only decorative CSS.

### 3a. Decision: theme attribute and naming

Three named themes on `<html data-theme>`: `dark` (default brand), `drafting` (the light Swiss theme). The toggle flips between `dark` and `drafting`. I am NOT using a generic `light` name because this theme has a strong identity and the semantic name keeps its token block self-contained and future-proof.

### 3b. Confirmed DARK palette (keep exactly as-is in `tokens.css` `:root`)

Keep the current values; just also expose them under `[data-theme="dark"]` for symmetry. Confirmed dark tokens:

| Token | Hex |
|---|---|
| `--bg` | `#0a0b0d` |
| `--bg-1` | `#101216` |
| `--bg-2` | `#15181d` |
| `--ink` | `#f4f4f0` |
| `--ink-dim` | `#a7abb1` |
| `--ink-faint` | `#6b7178` |
| `--lime` | `#ccff00` |
| `--lime-ink` | `#0a0b0d` |
| `--line` | `rgba(244,244,240,0.10)` |
| `--line-2` | `rgba(244,244,240,0.18)` |
| `--danger` | `#ff5a4d` |
| `color-scheme` | `dark` |

### 3c. The "Drafting Table" LIGHT palette (exact hex, WCAG-checked)

Add this block to `tokens.css`. The accent re-binds the `--lime` "signal" slot to oxide-red so components that reference `var(--lime)` get the light-theme signal automatically.

```css
[data-theme="drafting"] {
  color-scheme: light;

  /* paper grounds */
  --bg:        #F4F1EA;   /* warm bone (primary)        */
  --bg-1:      #F7F4EC;   /* ivory card / elevated      */
  --bg-2:      #EDE8DC;   /* oat band / footer          */

  /* graphite ink */
  --ink:       #1A1A1A;   /* 15.4:1 on bone — headers/body */
  --ink-dim:   #55524C;   /* 6.9:1  — captions, mono labels */
  --ink-faint: #8A867E;   /* decorative secondary           */

  /* signal slot re-bound to oxide-red (annotations ONLY) */
  --lime:      #9E3B2E;   /* 5.97:1 on bone — clears AA      */
  --lime-ink:  #F4F1EA;   /* text on oxide                   */
  --lime-soft: rgba(158, 59, 46, 0.12);
  --lime-glow: rgba(158, 59, 46, 0.22);

  /* hairlines (decorative, low-contrast on purpose) */
  --line:      #C9C4B8;   /* minor grid / hairline (~1.5:1) */
  --line-2:    #BBB6AA;   /* major grid line                */
  --danger:    #9E3B2E;

  /* drafting-only decorative tokens */
  --grid:       8px;      /* minor grid unit  */
  --grid-major: 64px;     /* major grid unit  */
  --hair:       0.75px;   /* hairline weight  */
  --reg:        #9E3B2E;  /* registration-mark color */
}
```

Contrast verification (against `#F4F1EA`): `--ink` 15.4:1, `--ink-dim` 6.9:1, oxide-red 5.97:1 — all clear WCAG AA for text. Hairlines at ~1.5:1 are exempt because no information depends on them. Rule of thumb to stay compliant: never tint text lighter than `--ink-dim` `#55524C` on these grounds, and never set body copy in oxide-red (it is scarce signal only: crop marks, figure numbers, the one underlined word, error/validation states).

### 3d. Drafting-only decorative CSS

Put this in a new `/Users/plasmic/dev/web/samedaydesk/client/src/styles/drafting.css` (imported once), all keyed under `[data-theme="drafting"]` so the dark theme is untouched.

Hairline grid (crisp on HiDPI via hard color stops and a thin band ending in transparent):

```css
[data-theme="drafting"] .draft-grid {
  background-color: var(--bg);
  background-image:
    repeating-linear-gradient(to right,  var(--line)   0, var(--line)   var(--hair), transparent var(--hair), transparent var(--grid)),
    repeating-linear-gradient(to bottom, var(--line)   0, var(--line)   var(--hair), transparent var(--hair), transparent var(--grid)),
    repeating-linear-gradient(to right,  var(--line-2) 0, var(--line-2) var(--hair), transparent var(--hair), transparent var(--grid-major)),
    repeating-linear-gradient(to bottom, var(--line-2) 0, var(--line-2) var(--hair), transparent var(--hair), transparent var(--grid-major));
}
```

Registration / crop marks (corner pseudo-elements in oxide-red), figure numbers, dimension lines, and a whisper paper-grain via inline feTurbulence (`fractalNoise`, `baseFrequency 1.1`, `numOctaves 2`, opacity `0.04`, `mix-blend-mode: multiply`, gated behind `prefers-reduced-data`). Typography gestures: oversized Space Grotesk display at `--step-5/6` with `letter-spacing:-0.02em` and tight leading; Inter body flush-left ragged-right at `--step-0`, `max-width:62ch`, `text-wrap:pretty`; JetBrains Mono callouts ALL CAPS at `--step--2` with `+0.08em` to `+0.14em` tracking for plate numbers, dimension labels, eyebrows. The tracking inversion (negative on big display, positive on small mono) is the core typographic move.

The shader is disabled under this theme (the host early-returns on `data-theme === "drafting"`) so the paper reads as still.

---

## PART 4 — No-FOUC accessible theme toggle

### 4a. Inline `<head>` script (synchronous, render-blocking, before any CSS)

This is the only reliable cure for the flash: the React bundle is a deferred module and runs after first paint. Add to `index.html` inside `<head>`, ABOVE the existing `<link rel="icon">` and the anti-flash `<style>`, and ABOVE `<script type="module" src="/src/main.tsx">`. Keep it literally inline (a CSP, if added later, needs a hash/nonce for it).

```html
<script>
  (function () {
    try {
      var KEY = 'sdd-theme';                 // 'dark' | 'drafting' | 'system'
      var BRAND_DEFAULT = 'dark';            // ship dark-first
      var stored = localStorage.getItem(KEY);
      var systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      var theme;
      if (stored === 'dark' || stored === 'drafting') theme = stored;
      else if (stored === 'system') theme = systemLight ? 'drafting' : 'dark';
      else theme = BRAND_DEFAULT;            // first visit: brand, not system
      var root = document.documentElement;
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = (theme === 'drafting') ? 'light' : 'dark';
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
</script>
```

The existing anti-flash `<style> html { background:#0a0b0d; color-scheme:dark; }</style>` (index.html lines 35 to 37) must move BELOW this script and be made theme-aware, or simply rely on `:root` tokens. Replace it with `html { background: var(--bg); }` once `tokens.css` loads, and let the inline script set `color-scheme` so the static rule does not force dark on the paper theme.

### 4b. Token architecture and `color-scheme`

`tokens.css` keeps the brand-neutral fallbacks on `:root` (current dark values), then full re-binds under `[data-theme="dark"]` and `[data-theme="drafting"]`, each setting its own `color-scheme` (`dark` / `light`) so native scrollbars, form controls, and autofill match. Bind `color-scheme` to the active theme, not a static `light dark`.

### 4c. React sync (ThemeProvider + useTheme)

Add `/Users/plasmic/dev/web/samedaydesk/client/src/lib/theme.tsx`. It must initialize state from the DOM attribute the inline script already wrote (never a hardcoded literal, which would desync and re-flash), persist to `localStorage` under `sdd-theme`, and subscribe to `matchMedia` only while the choice is `system`. `apply(next)` sets `data-theme`, `colorScheme`, and updates `meta[theme-color]`. Wrap the router in `<ThemeProvider>` (in `main.tsx`).

### 4d. Toggle button (accessible)

`/Users/plasmic/dev/web/samedaydesk/client/src/components/ThemeToggle.tsx`: a real `<button type="button">` with `aria-pressed`, an action-oriented `aria-label` ("Switch to Drafting Table theme" / "Switch to Engineered Speed theme"), the icon `aria-hidden`, and a token-driven focus ring (`outline: 2px solid var(--lime)`). Place it in `Nav.tsx` inside `.actions`. Enter/Space/focus order come free from `<button>`.

### 4e. Smooth swap without the muddy multi-fade

Two layers. First, the disable-transitions-during-switch trick: add a `theme-changing` class that sets `transition: none !important` on everything, then remove it after two rAFs. Second (progressive enhancement), a View Transitions circular clip-path reveal from the toggle button, gated behind `document.startViewTransition` feature-detection and `prefers-reduced-motion` (both falling through to the instant path). In React 19 wrap the state change in `flushSync` so the DOM reflects the new theme before the browser snapshots. Reduced-motion guard:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(root), ::view-transition-new(root) { animation: none !important; }
}
```

### 4f. `meta[theme-color]` per theme

Replace the single tag (index.html line 7) with two media-scoped tags for the no-JS/system case, and have `apply()` set a non-media-scoped tag on toggle so mobile chrome matches the chosen theme:

```html
<meta name="theme-color" content="#0a0b0d" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#F4F1EA" media="(prefers-color-scheme: light)" />
```

In JS, the active choice updates a `meta[name=theme-color]:not([media])` tag to `#0a0b0d` (dark) or `#F4F1EA` (drafting). Verify on a real iOS device (near-white values can misbehave; `#F4F1EA` is bone, not pure white, so it should be safe).

---

## PART 5 — Favicon + logo (one mark, both themes)

### 5a. Chosen logo concept: the "Same-Day Stamp"

One concept, committed: a double-chevron (fast-forward = speed) seated inside a rounded-square stamp/dispatch tile. It keeps the existing chevron equity, fixes the only weakness of a bare arrow (genericness is a flagged cliche) by containing it in a branded stamp shape, and fuses speed (chevron) with dispatched/done-today (stamp). It owns a circular crop edge-to-edge, survives 16px, and works as a 300x300 LinkedIn Company logo and as a badge beside a headshot.

Platform reality that shapes usage: Upwork individual and LinkedIn personal profiles require a real face photo (logos banned on Upwork personal), so the mark is the avatar on Fiverr (seller/agency), the Upwork AGENCY profile, the LinkedIn Company Page, plus favicon/OG/invoice/email; on Upwork/LinkedIn personal surfaces, run a headshot and let the mark live on cover images, gig thumbnails, and deliverables.

### 5b. SVG construction (one file, `currentColor`)

Author `/Users/plasmic/dev/web/samedaydesk/client/src/components/BrandMark.tsx` returning hand-authored SVG on `viewBox="0 0 100 100"` with a 10-unit safe margin (geometry inside 10 to 90 = circular-crop safe zone for free). Rules: FILLED geometry, no strokes for the chevron (strokes alias below 2px); snap anchors to an 8-unit grid; rounded-square tile with corner radius ~13 percent (`rx ~13`); build chevron #2 as a translated copy of chevron #1 so they are provably identical; give the pointed forms ~1 to 2 units optical overshoot; nudge the chevron group a few units RIGHT of true center (arrows read as sitting too far left). The chevron uses `fill="currentColor"`; CSS sets `color: var(--lime)` (dark = lime on near-black tile) or `color: var(--reg)` (drafting = oxide-red on bone). The tile fill reads `var(--bg)`. Identical path data and viewBox in both themes proves it is the same mark.

Replace the `▸▸` text glyph in `Nav.tsx` line 23 (`<span className={styles.mark} aria-hidden="true">▸▸</span>`) with `<BrandMark className={styles.mark} />`, and update `.mark` in `Nav.module.css` (lines 31 to 35) from a font-size hack to a sizing box (`width: 1.4em; height: 1.4em; color: var(--lime)`).

### 5c. Theme-adaptive favicon SVG

Edit `/Users/plasmic/dev/web/samedaydesk/client/public/favicon.svg` to carry an inline `<style>` with a `prefers-color-scheme` media query. Note the caveat: this keys off the OS/browser chrome scheme, NOT the site's `data-theme`. Design for "what color is the browser UI":

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>
    .tile { fill: #0a0b0d; } .mark { fill: #ccff00; }
    @media (prefers-color-scheme: dark) { .tile { fill: transparent; } }
  </style>
  <rect class="tile" width="32" height="32" rx="7"/>
  <path class="mark" d="M6.5 8.5 L15 16 L6.5 23.5 Z"/>
  <path class="mark" d="M15.5 8.5 L24 16 L15.5 23.5 Z"/>
</svg>
```

### 5d. Complete the 5-file modern set (currently missing 4 of them)

`public/` has only `favicon.svg` and `og.png`. The non-cargo-cult 2025/2026 set is five files. Generate the rasters from one tight master SVG plus one padded maskable master:

```bash
# from client/
npm i -D sharp-cli png-to-ico
npx sharp-cli -i public/icon-master.svg   -o public/apple-touch-icon.png    resize 180 180
npx sharp-cli -i public/icon-master.svg   -o public/icon-192.png            resize 192 192
npx sharp-cli -i public/icon-master.svg   -o public/icon-512.png            resize 512 512
npx sharp-cli -i public/icon-master.svg   -o public/favicon-32.png          resize 32 32
npx sharp-cli -i public/icon-maskable.svg -o public/icon-512-maskable.png   resize 512 512
npx png-to-ico public/favicon-32.png > public/favicon.ico && rm public/favicon-32.png
```

Maskable master: a 512 canvas filled `#0a0b0d` with the lime chevron scaled into roughly the center 60 to 70 percent, fully opaque, so Android's adaptive mask (safe circle = 40 percent radius, ~409px diameter on 512) never clips the mark. Verify in maskable.app.

### 5e. `site.webmanifest` + head tags

Create `/Users/plasmic/dev/web/samedaydesk/client/public/site.webmanifest`:

```json
{
  "name": "SameDayDesk",
  "short_name": "SameDayDesk",
  "description": "Same-day, done-for-you resumes, LinkedIn, cover letters and copy.",
  "start_url": "/", "scope": "/", "display": "standalone",
  "background_color": "#0a0b0d", "theme_color": "#0a0b0d",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Swap the favicon line in `index.html` for the full set (the `sizes="32x32"` on the .ico is a deliberate fix for an old Chrome SVG-vs-ICO preference bug):

```html
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

---

## FILE-BY-FILE ACTION CHECKLIST

**`client/src/components/EnergySurface.tsx`** — Replace `uTime = t*0.001` with the `elapsed`/`lastFrame` clock (clamped dt, `% 1000.0` wrap). Rewrite `play()` to reset `lastFrame = 0`. Replace `vel` state with `velTarget` (clamped raw, no `Math.max`). Move velocity damping into `loop` using `1 - exp(-lambda*dt)`. Edit the GLSL: time-scale `0.05 + uVel*0.18`, alpha `0.18 + 0.04*uVel`, add IGN dither before `gl_FragColor`. Floor dpr to 0.5 steps. Add live `prefers-reduced-motion` listener + one static frame. Add early-return when `document.documentElement.dataset.theme === 'drafting'`.

**`client/src/components/EnergySurface.module.css`** — `.canvas` opacity `0.6` to `0.9`.

**`client/src/styles/tokens.css`** — Add `[data-theme="dark"]` (mirror current `:root`) and the full `[data-theme="drafting"]` block (Part 3c) with `color-scheme` per theme.

**`client/src/styles/drafting.css`** (new) — Hairline grid, registration/crop marks, dimension lines, figure-number labels, paper grain, drafting typography. Import once (e.g. in `main.tsx` or `global.css`).

**`client/src/lib/theme.tsx`** (new) — `ThemeProvider` + `useTheme`, init from DOM attribute, persist `sdd-theme`, `matchMedia` only on `system`, `apply()` sets attribute + colorScheme + meta theme-color, `runThemeChange()` with View Transitions + `flushSync` + disable-transitions fallback.

**`client/src/components/ThemeToggle.tsx`** (new) — `<button>` with `aria-pressed`, label, hidden icon, token focus ring.

**`client/src/components/BrandMark.tsx`** (new) — Hand-authored Same-Day Stamp SVG, `viewBox 0 0 100 100`, filled chevron `currentColor`, tile `var(--bg)`.

**`client/src/components/Nav.tsx`** — Replace `▸▸` span (line 23) with `<BrandMark>`; add `<ThemeToggle>` in `.actions`.

**`client/src/components/Nav.module.css`** — Update `.mark` (lines 31 to 35) to a sizing box.

**`client/src/main.tsx`** — Wrap router in `<ThemeProvider>`; import `drafting.css`.

**`client/index.html`** — Add inline no-FOUC script (top of head). Make anti-flash style theme-aware (`background: var(--bg)`, drop hardcoded `color-scheme: dark`). Two media-scoped `theme-color` tags (`#0a0b0d` / `#F4F1EA`). Swap favicon line for the 4-tag set. Remove all em-dashes from title/OG/twitter copy (Part 2).

**`client/public/favicon.svg`** — Add `<style>` + `prefers-color-scheme: dark` block.

**`client/public/` (new files)** — `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `site.webmanifest`, plus build sources `icon-master.svg` and `icon-maskable.svg`.

**`client/package.json`** — Add dev deps `sharp-cli`, `png-to-ico`.

**Final guard** — Run `grep -rn "—" client/src client/index.html` and confirm clean before commit.

