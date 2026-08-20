import {
  createContext, useContext, useState, useCallback, type ReactNode,
} from "react";

// Two named themes. "dark" is the brand-default "Engineered Speed"; "drafting" is the
// light Swiss "Drafting Table". The toggle flips between them. The inline <head> script
// in index.html sets data-theme before first paint, so React only ever reads the DOM.
export type Theme = "dark" | "drafting";

const KEY = "sdd-theme";
const META: Record<Theme, string> = { dark: "#0a0b0d", drafting: "#F4F1EA" };

type Origin = { x: number; y: number };
type Ctx = {
  theme: Theme;
  setTheme: (t: Theme, origin?: Origin) => void;
  toggle: (origin?: Origin) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function readDom(): Theme {
  // Default is the Drafting Table (light) look; only "dark" is the opt-in.
  if (typeof document === "undefined") return "drafting";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "drafting";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "drafting" ? "light" : "dark";
  let m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    document.head.appendChild(m);
  }
  m.setAttribute("content", META[theme]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setState] = useState<Theme>(readDom);

  const setTheme = useCallback((next: Theme, origin?: Origin) => {
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }

    // The *visual* theme is the data-theme attribute (CSS), set synchronously by apply().
    // React state only drives component logic (toggle icon, drafting frame, the shader), so
    // no flushSync is needed: setting state from here schedules a normal re-render.
    const commit = () => { setState(next); apply(next); };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startVT = (document as unknown as {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    }).startViewTransition?.bind(document);

    // Progressive enhancement: a circular clip-path reveal from the toggle. Falls back to an
    // instant swap (with transitions briefly disabled, so nothing cross-fades muddy).
    if (!startVT || reduce) {
      const root = document.documentElement;
      root.classList.add("theme-changing");
      commit();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.classList.remove("theme-changing")),
      );
      return;
    }

    try {
      const transition = startVT(commit);
      if (origin) {
        transition.ready.then(() => {
          const { x, y } = origin;
          const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: 480, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
          );
        }).catch(() => { /* snapshot raced; swap already applied */ });
      }
    } catch {
      commit(); // any VT hiccup: apply instantly
    }
  }, []);

  const toggle = useCallback((origin?: Origin) => {
    setTheme(readDom() === "dark" ? "drafting" : "dark", origin);
  }, [setTheme]);

  // Initial state already matches the DOM: the inline <head> script set data-theme before
  // React mounted, and useState(readDom) read it. No reconcile effect needed.
  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Defensive fallback if used outside the provider.
  return { theme: readDom(), setTheme: () => {}, toggle: () => {} };
}
