import { useEffect } from "react";
import type Lenis from "lenis";
import { useReducedMotion } from "./useReducedMotion";

// Lenis smooth scroll: desktop + fine-pointer only, off under reduced-motion and on touch.
// Exposed on window for optional GSAP ScrollTrigger sync.
export function useSmoothScroll() {
  const reduce = useReducedMotion();
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (reduce || !finePointer) return;

    const owner = window as unknown as { __lenis?: Lenis };
    let lenis: Lenis | undefined;
    let disposed = false;
    let rafId = 0;
    void import("lenis").then(({ default: DesktopScroll }) => {
      if (disposed) return;
      lenis = new DesktopScroll({
        duration: 1.05,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      owner.__lenis = lenis;
      const raf = (time: number) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    }).catch(() => { /* Use the native scroller when the enhancement cannot load. */ });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      lenis?.destroy();
      if (owner.__lenis === lenis) owner.__lenis = undefined;
    };
  }, [reduce]);
}
