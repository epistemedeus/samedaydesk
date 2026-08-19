import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../lib/auth";
import styles from "./Nav.module.css";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={clsx(styles.nav, scrolled && styles.scrolled)}>
      <div className={clsx("container", styles.inner)}>
        <a href="/" className={styles.brand} aria-label="SameDayDesk home">
          <BrandMark className={styles.mark} />
          <span className={styles.word}>SameDayDesk</span>
        </a>

        <nav className={styles.links} aria-label="Primary">
          <a href="/report">Free report</a>
          <a href="/#offers">Prices</a>
          <a href="/audit/samedaydesk/2026-08-19/">Self-audit</a>
          <Link to="/tools/ai-readiness" viewTransition>Free tool</Link>
        </nav>

        <div className={styles.actions}>
          <Link
            to="/x402"
            className={styles.x402}
            aria-label="Agent payments and x402 data gateway"
            viewTransition
          >
            <span className={styles.x402Code}>x402</span>
            <span className={styles.x402Label}>Agent payments</span>
          </Link>
          <ThemeToggle />
          {user ? (
            <MagneticButton to="/dashboard" variant="primary" className={styles.cta}>Your desk</MagneticButton>
          ) : (
            <Link to="/login" className={styles.signin} viewTransition>Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
