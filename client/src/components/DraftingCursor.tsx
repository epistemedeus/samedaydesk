import { useEffect, useRef } from "react";
import styles from "./DraftingCursor.module.css";

// The drafting hand: in the hero, registration marks snap to the edges of the
// element under the cursor, with its dimensions. Fine pointer only; transform
// and opacity only; nothing here carries content.
export default function DraftingCursor() {
  const box = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scope = box.current?.closest("[data-measure-scope]") as HTMLElement | null;
    if (!fine || reduce || !scope || !box.current) return;
    let frame = 0;
    let target: Element | null = null;
    const draw = () => {
      frame = 0;
      const el = box.current!;
      if (!target) { el.dataset.on = ""; delete el.dataset.on; return; }
      const r = target.getBoundingClientRect(), s = scope.getBoundingClientRect();
      el.style.transform = `translate(${r.left - s.left}px, ${r.top - s.top}px)`;
      el.style.setProperty("--w", `${r.width}px`);
      el.style.setProperty("--h", `${r.height}px`);
      el.dataset.on = "";
      if (label.current) label.current.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
    };
    const move = (e: PointerEvent) => {
      const t = (e.target as Element).closest("[data-measure]");
      if (t !== target) { target = t; if (!frame) frame = requestAnimationFrame(draw); }
    };
    const leave = () => { target = null; if (!frame) frame = requestAnimationFrame(draw); };
    scope.addEventListener("pointermove", move, { passive: true });
    scope.addEventListener("pointerleave", leave);
    return () => { scope.removeEventListener("pointermove", move); scope.removeEventListener("pointerleave", leave); cancelAnimationFrame(frame); };
  }, []);

  return (
    <div ref={box} className={styles.marks} aria-hidden="true">
      <i className={styles.tl} /><i className={styles.tr} /><i className={styles.bl} /><i className={styles.br} />
      <span ref={label} className={styles.dim} />
    </div>
  );
}
