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

  // One menu open at a time; Escape and an outside click close them.
  useEffect(() => {
    const menus = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-menu]"));
    const onClick = (e: MouseEvent) => menus().forEach((d) => { if (d.open && !d.contains(e.target as Node)) d.open = false; });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") menus().forEach((d) => { if (d.open) { d.open = false; d.querySelector("summary")?.focus(); } }); };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <header className={clsx(styles.nav, scrolled && styles.scrolled)}>
      <div className={clsx("container", styles.inner)}>
        <Link to="/" className={styles.brand} aria-label="SameDayDesk home">
          <BrandMark className={styles.mark} />
          <span className={styles.word}>SameDayDesk</span>
        </Link>

        <nav className={styles.links} aria-label="Primary">
          <details className={styles.menu} data-menu>
            <summary>Builds</summary>
            <div className={styles.panel}>
              <Link to="/#services"><strong>The four builds</strong><span>Scope, time, price and test, compared.</span></Link>
              <Link to="/x402" viewTransition><strong>Paid machine routes</strong><span>The x402 gateway, live on Base.</span></Link>
              <Link to="/#check"><strong>Free route check</strong><span>Run it on your own domain.</span></Link>
            </div>
          </details>
          <Link to="/#how">How it works</Link>
          <details className={styles.menu} data-menu>
            <summary>Company</summary>
            <div className={styles.panel}>
              <Link to="/company" viewTransition><strong>About</strong><span>What we do and how.</span></Link>
              <Link to="/security" viewTransition><strong>Security and trust</strong><span>Payments, credentials, evidence.</span></Link>
              <Link to="/changelog" viewTransition><strong>Changelog</strong><span>What changed, dated.</span></Link>
            </div>
          </details>
        </nav>

        <details className={`${styles.menu} ${styles.mobileMenu}`} data-menu>
          <summary aria-label="Menu">Menu</summary>
          <div className={styles.panel} style={{ insetInlineStart: "auto", insetInlineEnd: 0 }}>
            <Link to="/#services"><strong>The four builds</strong><span>Scope, time, price and test.</span></Link>
            <Link to="/#check"><strong>Free route check</strong><span>Run it on your own domain.</span></Link>
            <Link to="/x402" viewTransition><strong>Paid machine routes</strong><span>The x402 gateway.</span></Link>
            <Link to="/#how"><strong>How it works</strong></Link>
            <Link to="/company" viewTransition><strong>About</strong></Link>
            <Link to="/security" viewTransition><strong>Security and trust</strong></Link>
          </div>
        </details>

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
            <>
              <Link to="/login" className={styles.signin} viewTransition>Sign in</Link>
              <MagneticButton to="/signup" variant="primary" className={styles.cta}>Get started</MagneticButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
