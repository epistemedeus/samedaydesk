import { useEffect } from "react";
import { setupGsap, gsap, ScrollTrigger, prefersReducedMotion } from "./gsap";

// One global reveal: any [data-reveal] element fades + rises as it scrolls in.
// Elements with [data-reveal-stagger] reveal their direct children in sequence.
// No-JS / reduced-motion → everything is simply visible (we never hide via CSS).
export function useScrollReveal() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    setupGsap();

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      items.forEach((el) => {
        const isStagger = el.hasAttribute("data-reveal-stagger");
        const targets = isStagger ? Array.from(el.children) : el;
        gsap.from(targets, {
          opacity: 0,
          y: 26,
          duration: 0.85,
          ease: "power3.out",
          stagger: isStagger ? 0.09 : 0,
          scrollTrigger: { trigger: el, start: "top 84%", once: true },
        });
      });
    });

    // Recompute once fonts/layout settle.
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 300);
    return () => {
      window.clearTimeout(id);
      ctx.revert();
    };
  }, []);
}
