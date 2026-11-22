import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../lib/theme";
import { useReducedMotion } from "../motion/useReducedMotion";
import styles from "./DraftingCrosshair.module.css";

// Short drafting ticks stay at the viewport edges. Reading areas and the system cursor
// remain clear. Fine pointers only; off under reduced motion and on the legal pages.
const QUIET = /^\/(terms|privacy)\b/;

export default function DraftingCrosshair() {
  const { theme } = useTheme();
  const { pathname } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const on = theme === "drafting" && !reduce && !QUIET.test(pathname);

  useEffect(() => {
    const el = root.current;
    if (!on || !el) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tickX = el.querySelector<HTMLElement>("[data-tick-x]")!;
    const tickY = el.querySelector<HTMLElement>("[data-tick-y]")!;
    let raf = 0;
    let last: PointerEvent | null = null;
    const grid = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--grid-major")) || 56;

    const draw = () => {
      raf = 0;
      if (!last) return;
      const g = grid();
      // The ground's lines sit at k·g − g/2 in page coordinates (drafting.css).
      const col = Math.round((last.clientX + scrollX + g / 2) / g);
      const row = Math.round((last.clientY + scrollY + g / 2) / g);
      const x = col * g - g / 2 - scrollX;
      const y = row * g - g / 2 - scrollY;
      const target = last.target as Element | null;
      const inHero = !!target?.closest?.("[data-hero]");
      const overThing = !!target?.closest?.("a, button, input, textarea, select, summary, article, [role='dialog']");
      el.dataset.state = inHero ? "off" : overThing ? "faint" : "on";
      tickX.style.transform = `translateX(${x}px)`;
      tickY.style.transform = `translateY(${y}px)`;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const leave = () => { el.dataset.state = "off"; };
    const scroll = () => { if (last && !raf) raf = requestAnimationFrame(draw); };
    addEventListener("pointermove", move, { passive: true });
    addEventListener("scroll", scroll, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("scroll", scroll);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [on]);

  if (!on) return null;
  return (
    <div ref={root} className={styles.layer} data-drafting-rulers data-state="off" aria-hidden="true">
      <span className={styles.tickX} data-tick-x />
      <span className={styles.tickY} data-tick-y />
    </div>
  );
}
