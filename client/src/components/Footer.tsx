import { Link } from "react-router-dom";
import clsx from "clsx";
import BrandMark from "./BrandMark";
import styles from "./Footer.module.css";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={clsx("container", styles.inner)}>
        <div className={styles.brandCol}>
          <Link to="/" className={styles.brand} aria-label="SameDayDesk home">
            <BrandMark className={styles.mark} /> SameDayDesk
          </Link>
          <p className={styles.tag}>Hand off the busywork. Get it back today.</p>
          <a className={styles.contact} href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>
        </div>

        <nav className={styles.col} aria-label="Services">
          <h3 className={styles.colhead}>Services</h3>
          <a href="#services">Résumé + LinkedIn</a>
          <a href="#services">Cover letters</a>
          <a href="#services">Landing page copy</a>
          <a href="#services">Custom work</a>
        </nav>

        <nav className={styles.col} aria-label="Company">
          <h3 className={styles.colhead}>Company</h3>
          <a href="#how">How it works</a>
          <a href="#guarantee">Guarantee</a>
          <Link to="/terms" viewTransition>Terms</Link>
          <Link to="/privacy" viewTransition>Privacy</Link>
        </nav>
      </div>

      <div className={clsx("container", styles.base)}>
        <span className="mono">© {year} SameDayDesk</span>
        <span className={styles.usco}>Same-day, done-for-you desk.</span>
      </div>
    </footer>
  );
}
