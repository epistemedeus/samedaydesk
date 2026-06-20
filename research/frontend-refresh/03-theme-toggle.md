# Light/Dark Theme Toggle for SameDayDesk: 2025-2026 Best Practices and Copy-Pasteable Implementation

_Research report for the SameDayDesk frontend refresh (2026-06-20). Area: theme-toggle._

## Key takeaways

- No-FOUC requires a tiny SYNCHRONOUS inline script in <head> (before any CSS/markup that paints). It reads localStorage, falls back to prefers-color-scheme, and sets data-theme on document.documentElement before first paint. It must be inline (not a deferred/module bundle) because external/module scripts are async and run after paint, causing a flash of the wrong theme.
- Bind every theme via CSS custom properties: brand-neutral defaults under :root, then full re-binds under [data-theme="dark"] and [data-theme="light"]. Because your components already use var(--bg)/var(--ink)/var(--lime), a theme swap is mostly token re-binding plus theme-specific decorative CSS.
- Set color-scheme per theme so native UI (scrollbars, form controls, autofill, spellcheck) matches. Use color-scheme: dark or light tied to the active [data-theme], not a static light dark.
- Brand-default vs system-default: for a productized brand like SameDayDesk, default to your signature dark 'Engineered Speed' theme on first visit, but still honor a saved choice and offer the toggle. Only fall back to prefers-color-scheme when there is no stored preference (so first-time system-light users are not jarred).
- React sync: a small ThemeProvider/useTheme hook that initializes from the DOM attribute the inline script already set (never from a hardcoded default, which would desync), persists to localStorage, and subscribes to matchMedia('(prefers-color-scheme: dark)') ONLY while the user is on 'system'.
- Accessibility: use a real <button> with aria-pressed for an instant on/off toggle (Sara Soueidan / Kitty Giraudel guidance), give it a clear label, and respect prefers-reduced-motion by skipping the cross-fade. role="switch" is acceptable but aria-pressed on a button is the most robust for a 2-state immediate-effect control.
- Kill the 'everything fades weirdly' problem with the disable-transitions-during-switch trick: add a class that sets transition: none !important on the switch frame, then remove it on the next animation frame.
- For a premium cross-fade, use the View Transitions API with a circular clip-path reveal originating from the toggle button (Math.hypot for the cover radius). Gate it behind feature detection (document.startViewTransition) and prefers-reduced-motion, falling back to an instant swap.
- Update <meta name="theme-color"> per theme: ship two media-scoped tags for the no-JS/system case, and also setAttribute('content', ...) on toggle so the mobile browser chrome matches the chosen (not just system) theme. Note iOS Safari PWA quirks.
- In React 18, wrap the state change passed to startViewTransition in flushSync so the DOM reflects the new theme before the browser snapshots the 'new' frame.

---

## Light/Dark Theme Toggle for SameDayDesk (Vite + React 18 + CSS custom properties)

This is grounded in your exact stack: token-driven CSS (`var(--bg)`, `var(--ink)`, `var(--lime)`), a fixed dark brand default (`#0a0b0d` / `#f4f4f0` / `#ccff00`), `react-router-dom`, and an SPA (no SSR). Everything below is copy-pasteable and tuned so the two themes can be aesthetically distinct (not merely inverted), because each theme fully re-binds its tokens and can add theme-only decorative CSS.

A note before code: because your second theme is meant to be a genuinely different aesthetic (not an inversion), prefer a semantic `data-theme="light"` / `data-theme="dark"` attribute over a single `.dark` class. The attribute reads cleanly when you later add a third look, and it keeps each theme's token block self-contained.

---

### 1. No-FOUC inline `<head>` script (render-blocking, before first paint)

The flash happens because your real theme logic lives in the React bundle, which is a `type="module"` (deferred) script: it executes only after HTML parses and React hydrates, so the browser paints the default theme first, then snaps to the right one. The fix is a tiny **synchronous, inline** script placed in `<head>` *before* your stylesheet links. Synchronous inline scripts are render-blocking: "nothing will be painted to the screen until that JS code has been evaluated," and `localStorage` access is on the order of microseconds, so the cost is negligible (Josh Comeau, https://www.joshwcomeau.com/react/dark-mode/).

In your Vite `index.html`, inside `<head>`, above the CSS/`tokens.css` link and above the `<script type="module" src="/src/main.tsx">`:

```html
<!-- index.html -->
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Default (system / no-JS) browser-chrome colors; JS will override on toggle -->
  <meta name="theme-color" content="#0a0b0d" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#f4f4f0" media="(prefers-color-scheme: light)" />

  <!-- RENDER-BLOCKING, runs before first paint. Keep it inline & synchronous. -->
  <script>
    (function () {
      try {
        var KEY = 'sdd-theme';                 // 'light' | 'dark' | 'system'
        var BRAND_DEFAULT = 'dark';            // SameDayDesk ships dark-first
        var stored = localStorage.getItem(KEY);
        var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        var theme;
        if (stored === 'light' || stored === 'dark') {
          theme = stored;                      // explicit user choice wins
        } else if (stored === 'system') {
          theme = systemDark ? 'dark' : 'light';
        } else {
          // First-ever visit, no stored pref: brand default, NOT system.
          theme = BRAND_DEFAULT;
        }

        var root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme;        // native UI matches immediately
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  </script>

  <link rel="stylesheet" href="/src/styles/tokens.css" />
  <!-- ...fonts, etc... -->
</head>
```

Why inline and not imported: a Vite `import './theme'` becomes a module script that is implicitly deferred and runs after the document is parsed, so it cannot beat first paint. Max Böck calls the failure mode a "FART (Flash of inAccurate coloR Theme)" and likewise uses an inline `<head>` snippet to set `data-theme` "as early as possible" (https://mxb.dev/blog/color-theme-switcher/). The same inline-before-React pattern is the standard cure for React/Vite flicker (https://www.notanumber.in/blog/fixing-react-dark-mode-flickering).

One Vite caveat: keep this script literally inline in `index.html`. Do not move it into a `.ts` entry, and if you use a CSP, you will need a hash/nonce for this inline block.

---

### 2. Token architecture (`:root` defaults, then per-theme re-binds + `color-scheme`)

Define brand-neutral fallbacks on `:root`, then **fully re-bind** every token under each `[data-theme="..."]`. This is what lets the two themes look distinct: the light theme is free to use different accents, surfaces, shadows, even a different decorative treatment, rather than inverting the dark values.

```css
/* tokens.css */

/* Fallbacks so the page is never unthemed even mid-load */
:root {
  --bg:        #0a0b0d;
  --ink:       #f4f4f0;
  --lime:      #ccff00;
  --surface:   #131417;
  --muted:     #9aa0a6;
  --border:    rgba(244, 244, 240, 0.10);
  --accent-contrast: #0a0b0d; /* text that sits on the lime accent */
  color-scheme: dark;
}

/* DARK — "Engineered Speed" */
[data-theme="dark"] {
  --bg:        #0a0b0d;
  --ink:       #f4f4f0;
  --lime:      #ccff00;          /* electric lime pops on near-black */
  --surface:   #131417;
  --muted:     #9aa0a6;
  --border:    rgba(244, 244, 240, 0.10);
  --accent-contrast: #0a0b0d;
  color-scheme: dark;            /* native scrollbars/form controls go dark */
}

/* LIGHT — a deliberately different aesthetic, not an inversion.
   e.g. warm paper bg, ink-black text, a deeper lime so it stays legible
   on light surfaces (pure #ccff00 fails contrast on white). */
[data-theme="light"] {
  --bg:        #f6f6f1;          /* warm off-white, not #fff */
  --ink:       #101113;
  --lime:      #5b7a00;          /* darkened lime for AA contrast on light */
  --surface:   #ffffff;
  --muted:     #5a6066;
  --border:    rgba(16, 17, 19, 0.12);
  --accent-contrast: #ffffff;
  color-scheme: light;
}
```

`color-scheme` is the piece teams forget: it tells the user agent which scheme to render native chrome in (canvas, scrollbars, default form controls, spellcheck underlines, autofill) so they match your tokens instead of fighting them (MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme). Bind it to the *active* theme (`dark` or `light`), not a static `light dark`, since you are choosing the theme explicitly.

`light-dark()` aside: CSS now has a `light-dark(lightVal, darkVal)` function that, combined with `color-scheme: light dark`, replaces per-token media queries (MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme). It is elegant for pure light/dark inversions, but for genuinely distinct brand themes (and a possible future third look) the explicit `[data-theme]` token blocks above are clearer and more extensible, so prefer those here.

**Brand-default vs system-default tradeoff.** A content site might default to the OS preference. A *brand*, like SameDayDesk, usually wants its signature look on first impression. The recommendation: ship dark ("Engineered Speed") as the first-paint default, honor any saved choice above all, and only consult `prefers-color-scheme` when the user has explicitly chosen "system." That avoids both the cold-brand problem (defaulting to light because the visitor's OS is light) and the override problem (ignoring a deliberate user choice).

---

### 3. React state sync: a small `ThemeProvider` + `useTheme` hook

The hook must **initialize from the DOM attribute the inline script already set**, never from a hardcoded literal. Hardcoding `useState('dark')` would desync React from what is already painted and re-introduce a flash. It persists to `localStorage` and subscribes to `matchMedia` only while the user is on `'system'`.

```tsx
// ThemeProvider.tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';

type ThemeChoice = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';
const KEY = 'sdd-theme';

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

function readStoredChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'dark'; // SSR-ish safety
  const s = localStorage.getItem(KEY);
  return s === 'light' || s === 'dark' || s === 'system' ? s : 'dark';
}

// Trust what the inline script already wrote to the DOM.
function readResolvedFromDom(): Resolved {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light' : 'dark';
}

type Ctx = {
  choice: ThemeChoice;          // what the user picked
  resolved: Resolved;           // what is actually applied
  setChoice: (c: ThemeChoice) => void;
  toggle: (origin?: { x: number; y: number }) => void;
};
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [resolved, setResolved] = useState<Resolved>(readResolvedFromDom);

  // Apply a resolved theme to the DOM (and remember it for the toggle).
  const apply = useCallback((next: Resolved) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    setResolved(next);
    updateMetaThemeColor(next); // see section 6
  }, []);

  const setChoice = useCallback((c: ThemeChoice) => {
    localStorage.setItem(KEY, c);
    setChoiceState(c);
    apply(c === 'system' ? (prefersDark() ? 'dark' : 'light') : c);
  }, [apply]);

  // Only follow the OS while the user is on "system".
  useEffect(() => {
    if (choice !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [choice, apply]);

  // Optional: sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setChoice((e.newValue as ThemeChoice) ?? 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setChoice]);

  const toggle = useCallback((origin?: { x: number; y: number }) => {
    const next: Resolved = resolved === 'dark' ? 'light' : 'dark';
    runThemeChange(() => setChoice(next), origin); // see section 5
  }, [resolved, setChoice]);

  const value = useMemo(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
```

The `typeof window === 'undefined'` guards make this safe if you ever prerender/SSG with Vite, even though it is an SPA today. This mirrors Josh Comeau's "read the value the blocking script already computed, then hand it to React" approach (https://www.joshwcomeau.com/react/dark-mode/).

---

### 4. Accessibility: toggle semantics, label, keyboard, reduced motion

For a control with an immediate two-state effect and no indeterminate state, the accessibility consensus is a real `<button>` with `aria-pressed`. Kitty Giraudel: "If the toggle has an immediate effect (and therefore relies on JavaScript), and provided it cannot have an indeterminate state, then it should be a button element with the `aria-pressed` attribute" (https://kittygiraudel.com/2021/04/05/an-accessible-toggle/). When `aria-pressed` is present the button is exposed as a toggle button, and screen readers announce "pressed"/"not pressed" alongside the accessible name. `role="switch"` is also valid for on/off, but `aria-pressed` on a `<button>` is the most broadly robust choice for theme toggles (Sara Soueidan, https://www.sarasoueidan.com/blog/toggle-switch-design/).

```tsx
// ThemeToggle.tsx
import { useRef } from 'react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);
  const isDark = resolved === 'dark';

  const onClick = () => {
    const r = ref.current?.getBoundingClientRect();
    const origin = r
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : undefined;
    toggle(origin);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="theme-toggle"
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  );
}
```

Accessibility checklist:
- It is a `<button>`, so Enter/Space and focus order come for free; do not put the handler on a `<div>`.
- `aria-label` gives an action-oriented accessible name (icon-only buttons otherwise announce nothing useful); the icon is `aria-hidden`.
- `aria-pressed` reflects the current state. (If you prefer "switch" semantics, use `role="switch"` + `aria-checked` instead, but do not mix both.)
- Provide a visible focus ring driven by tokens (`outline: 2px solid var(--lime)`), and never remove focus styles.

**prefers-reduced-motion** is handled in two places: the View Transition is skipped entirely for those users (section 5), and any token transitions are disabled:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none !important;
  }
}
```

---

### 5. Smooth cross-fade: View Transitions circular reveal + the "disable transitions" trick

Two layers of polish.

**(a) The disable-transitions-during-switch trick.** If your components animate `background`/`color`, flipping the theme makes every element transition independently, which looks muddy. The standard fix is to momentarily kill transitions during the swap, then restore them on the next frame (CSS-Tricks / Paul Irish pattern):

```css
/* applied only for one frame while switching */
.theme-changing,
.theme-changing * ,
.theme-changing *::before,
.theme-changing *::after {
  transition: none !important;
}
```

**(b) View Transitions API with a circular reveal from the toggle.** Feature-detect `document.startViewTransition`, bail out for reduced-motion or unsupported browsers (instant swap), and otherwise animate a `clip-path` circle expanding from the button. In React 18 wrap the state change in `flushSync` so the DOM is updated before the browser snapshots the "new" frame (Akash Hamirwasia, https://akashhamirwasia.com/blog/full-page-theme-toggle-animation-with-view-transitions-api/).

```tsx
// themeTransition.ts
import { flushSync } from 'react-dom';

export function runThemeChange(
  applyChange: () => void,
  origin?: { x: number; y: number },
) {
  const root = document.documentElement;

  const reduceMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fallback: no View Transitions support OR reduced motion -> instant.
  // Still use the disable-transitions trick to avoid a muddy multi-fade.
  if (!('startViewTransition' in document) || reduceMotion) {
    root.classList.add('theme-changing');
    applyChange();
    // restore transitions on the next frame
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-changing')),
    );
    return;
  }

  // @ts-expect-error: startViewTransition is not yet in all TS lib targets
  const transition = document.startViewTransition(() => {
    flushSync(applyChange); // ensure DOM reflects new theme before snapshot
  });

  transition.ready.then(() => {
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    // Radius that reaches the farthest corner from the origin.
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    root.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 450,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  });
}
```

```css
/* Disable the default fade so only our clip-path reveal plays. */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
/* Paint the new theme on top during the reveal. */
::view-transition-new(root) { z-index: 1; }
::view-transition-old(root) { z-index: 0; }
```

Notes from the spec/guidance: `transition.ready` resolves once the pseudo-elements are attached, which is when you start the `clip-path` animation; `Math.hypot` gives the cover radius from any button position; `flushSync` is required so React's DOM update is captured as the "new" snapshot (web.dev View Transitions guidance; Akash Hamirwasia, https://akashhamirwasia.com/blog/full-page-theme-toggle-animation-with-view-transitions-api/; reference implementation: https://github.com/rudrodip/theme-toggle-effect). Support today is Chromium-based browsers (Chrome/Edge 111+); Firefox and older Safari fall through to the instant path, which is exactly the graceful degradation you want. GSAP, which you already ship, is not needed for this animation; the Web Animations API call above is sufficient and avoids snapshotting issues.

---

### 6. `<meta name="theme-color">` per theme

Two layers again. The media-scoped tags in `index.html` (section 1) cover the no-JS and system cases. But once a user explicitly toggles to a theme that differs from their OS, you must update the meta tag in JS so the mobile browser chrome (address bar, status bar) matches the chosen theme, not the OS (CSS-Tricks, https://css-tricks.com/meta-theme-color-and-trickery/):

```ts
// called from apply() in the provider
export function updateMetaThemeColor(resolved: 'light' | 'dark') {
  const color = resolved === 'dark' ? '#0a0b0d' : '#f6f6f1';
  // Update (or create) a non-media-scoped tag that wins for the active choice.
  let tag = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]:not([media])',
  );
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'theme-color');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', color);
}
```

Caveats worth knowing: browsers pick the first matching `theme-color` tag, and a light tag with `media="all"` will shadow a dark tag, so keep your two static tags strictly media-scoped (`prefers-color-scheme: light` / `dark`) and let the JS-managed non-media tag take precedence for explicit choices (https://blog.jim-nielsen.com/2025/dont-forget-meta-theme-color/). iOS Safari has quirks: in PWA standalone mode changing `theme-color` can cause an unexpected transition, and it may ignore certain colors near pure white (CSS-Tricks, https://css-tricks.com/meta-theme-color-and-trickery/), so test on a real device. Your dark `#0a0b0d` and warm-light `#f6f6f1` should both be safe.

---

### How the pieces fit (load order)

1. Browser parses `<head>`; the **inline script** sets `data-theme` + `color-scheme` before any paint (no flash).
2. `tokens.css` resolves all `var(--*)` against the already-correct `[data-theme]`.
3. React boots; `ThemeProvider` reads the attribute the inline script wrote, so state matches the screen.
4. User clicks `ThemeToggle`; `runThemeChange` runs the View Transition circular reveal (or instant fallback), `apply()` updates the attribute, `color-scheme`, persists to `localStorage`, and updates `meta[theme-color]`.
5. If the user chose "system," the `matchMedia` listener keeps the resolved theme in sync with the OS.

### Implementation order for your repo
1. Add the inline script + the two media `theme-color` tags to `index.html`.
2. Extend `tokens.css` with the `[data-theme="light"]` / `[data-theme="dark"]` blocks and per-theme `color-scheme` (then design the light palette to be a distinct look, not an inversion: shift `--bg` to warm paper and darken `--lime` so it passes contrast on light surfaces).
3. Drop in `ThemeProvider.tsx`, `ThemeToggle.tsx`, `themeTransition.ts`; wrap your router in `<ThemeProvider>`.
4. Add the View Transition CSS and the reduced-motion guard.
5. Verify on iOS Safari (meta color), a reduced-motion profile, and a keyboard-only pass (focus ring + `aria-pressed` announcement).

## Sources

- https://www.joshwcomeau.com/react/dark-mode/
- https://mxb.dev/blog/color-theme-switcher/
- https://akashhamirwasia.com/blog/full-page-theme-toggle-animation-with-view-transitions-api/
- https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color
- https://css-tricks.com/meta-theme-color-and-trickery/
- https://blog.jim-nielsen.com/2025/dont-forget-meta-theme-color/
- https://kittygiraudel.com/2021/04/05/an-accessible-toggle/
- https://www.sarasoueidan.com/blog/toggle-switch-design/
- https://www.notanumber.in/blog/fixing-react-dark-mode-flickering
- https://github.com/rudrodip/theme-toggle-effect
- https://www.aleksandrhovhannisyan.com/blog/the-perfect-theme-switch/
