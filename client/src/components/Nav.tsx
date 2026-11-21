import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import BrandMark from "./BrandMark";
import ThemeToggle from "./ThemeToggle";
import AgentMark from "./AgentMark";
import { useAuth } from "../lib/auth";
import styles from "./Nav.module.css";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const menu = useRef<HTMLDivElement>(null);
  const { pathname, hash } = useLocation();

  // Close the phone menu whenever a link inside it changes the route.
  useEffect(() => { menu.current?.hidePopover?.(); }, [pathname, hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={clsx(styles.nav, scrolled && styles.scrolled)}>
      <div className={clsx("container", styles.inner)}>
        <Link to="/" className={styles.brand} aria-label="SameDayDesk home">
          <BrandMark className={styles.mark} />
          <span className={styles.word}>SameDayDesk</span>
        </Link>

        <nav className={styles.links} aria-label="Primary">
          <Link to="/#services">Services</Link>
          <Link to="/#how">How it works</Link>
          <Link to="/tools/ai-readiness" viewTransition>Free tool</Link>
          <AgentMark placement="nav" />
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
          <button type="button" className={styles.menuButton} popoverTarget="sdd-menu" data-menu-toggle>
            <span className={styles.menuGlyph} aria-hidden="true" />
            Menu
          </button>
          {user ? (
            <MagneticButton to="/dashboard" variant="primary" className={styles.cta}>Your desk</MagneticButton>
          ) : (
            <>
              <Link to="/login" className={styles.signin} viewTransition>Sign in</Link>
              <MagneticButton to="/signup" variant="primary" className={styles.cta}>Get started</MagneticButton>
            </>
          )}
        </div>
      </div>

      <div ref={menu} id="sdd-menu" popover="auto" className={styles.sheet}>
        <nav className={styles.sheetLinks} aria-label="Menu">
          <Link to="/#services">Services</Link>
          <Link to="/#how">How it works</Link>
          <Link to="/tools/ai-readiness" viewTransition>Free tool</Link>
          <Link to="/x402" viewTransition>Agent payments <span className={styles.x402Code}>x402</span></Link>
          <Link to="/receipts" viewTransition>Receipts</Link>
        </nav>
        <AgentMark placement="menu" />
        <div className={styles.sheetActions}>
          {user ? (
            <Link to="/dashboard" className={styles.sheetPrimary}>Your desk</Link>
          ) : (
            <>
              <Link to="/login" className={styles.sheetSecondary} viewTransition>Sign in</Link>
              <Link to="/signup" className={styles.sheetPrimary}>Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
