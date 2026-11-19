import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../lib/theme";
import styles from "./DraftingCrosshair.module.css";

// The drafting crosshair: two oxide hairlines cross the grid at the pointer and snap to the
// nearest grid intersection, with a plotter readout (C·14 / R·06) and ticks on the margin
// rulers. Over a card or a control the hairlines fade and the card's corner crosses close in;
// inside the hero the reticle has the sight, so there are never two. The system cursor stays.
// Drafting Table theme, fine pointers only; off under reduced motion and on the legal pages.
const QUIET = /^\/(terms|privacy)\b/;

export default function DraftingCrosshair() {
  const { theme } = useTheme();
  const { pathname } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const on = theme === "drafting" && !QUIET.test(pathname);

  useEffect(() => {
    const el = root.current;
    if (!on || !el) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const h = el.querySelector<HTMLElement>("[data-h]")!;
    const v = el.querySelector<HTMLElement>("[data-v]")!;
    const read = el.querySelector<HTMLElement>("[data-read]")!;
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
      v.style.transform = `translateX(${x}px)`;
      h.style.transform = `translateY(${y}px)`;
      tickX.style.transform = `translateX(${x}px)`;
      tickY.style.transform = `translateY(${y}px)`;
      read.style.transform = `translate(${x + 10}px, ${y + 8}px)`;
      read.textContent = `C·${String(col).padStart(2, "0")} / R·${String(row).padStart(2, "0")}`;
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
    <div ref={root} className={styles.layer} data-state="off" aria-hidden="true">
      <span className={styles.v} data-v />
      <span className={styles.h} data-h />
      <span className={styles.tickX} data-tick-x />
      <span className={styles.tickY} data-tick-y />
      <span className={styles.read} data-read />
    </div>
  );
}
