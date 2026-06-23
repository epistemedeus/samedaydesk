import { useRef, type ReactNode, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import styles from "./MagneticButton.module.css";

type Props = {
  children: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  magnetic?: boolean;
  className?: string;
  ariaLabel?: string;
};

// A button/link that drifts toward the cursor on hover (desktop, fine-pointer, motion-ok).
// Used sparingly: the flagship CTA. No-ops on touch / keyboard / reduced-motion.
export default function MagneticButton({
  children, to, href, onClick, variant = "primary", magnetic = false, className, ariaLabel,
}: Props) {
  const inner = useRef<HTMLSpanElement>(null);

  const canMagnet = () =>
    magnetic &&
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (e: MouseEvent) => {
    if (!canMagnet() || !inner.current) return;
    const r = inner.current.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    inner.current.style.transform = `translate(${x * 0.22}px, ${y * 0.3}px)`;
  };
  const onLeave = () => {
    if (inner.current) inner.current.style.transform = "";
  };

  const cls = clsx(styles.btn, styles[variant], className);
  const body = <span ref={inner} className={styles.inner}>{children}</span>;
  const h = magnetic ? { onMouseMove: onMove, onMouseLeave: onLeave } : {};

  if (to) return <Link to={to} className={cls} aria-label={ariaLabel} viewTransition onClick={onClick} {...h}>{body}</Link>;
  if (href) return <a href={href} className={cls} aria-label={ariaLabel} target="_blank" rel="noopener noreferrer" onClick={onClick} {...h}>{body}</a>;
  return <button type="button" className={cls} aria-label={ariaLabel} onClick={onClick} {...h}>{body}</button>;
}
