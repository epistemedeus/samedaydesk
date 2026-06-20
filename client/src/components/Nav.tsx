import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import MagneticButton from "./MagneticButton";
import styles from "./Nav.module.css";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={clsx(styles.nav, scrolled && styles.scrolled)}>
      <div className={clsx("container", styles.inner)}>
        <Link to="/" className={styles.brand} aria-label="SameDayDesk — home">
          <span className={styles.mark} aria-hidden>▸▸</span>
          <span className={styles.word}>SameDayDesk</span>
        </Link>

        <nav className={styles.links} aria-label="Primary">
          <a href="#services">Services</a>
          <a href="#how">How it works</a>
          <a href="#guarantee">Guarantee</a>
        </nav>

        <div className={styles.actions}>
          <Link to="/login" className={styles.signin} viewTransition>Sign in</Link>
          <MagneticButton to="/signup" variant="primary" className={styles.cta}>Get started</MagneticButton>
        </div>
      </div>
    </header>
  );
}
