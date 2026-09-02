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
          <p className={styles.tag}>Agent commerce, built and shipped.</p>
          <a className={styles.contact} href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>
        </div>

        <nav className={styles.col} aria-label="Services">
          <h3 className={styles.colhead}>Services</h3>
          <Link to="/#services">Agent workflows</Link>
          <Link to="/#services">MCP servers</Link>
          <Link to="/#services">Machine payments</Link>
          <Link to="/#services">Custom work</Link>
        </nav>

        <nav className={styles.col} aria-label="Free tools & resources">
          <h3 className={styles.colhead}>Free tools</h3>
          <Link to="/tools/ai-readiness" viewTransition>AI visibility checker</Link>
          <Link to="/x402" viewTransition>x402 data gateway</Link>
          {/* Static pages served outside the SPA router: plain <a> so the browser
              does a full navigation instead of React Router hitting the fallback. */}
          <a href="/tools/free-seo-ai-tools.html">All free tools</a>
          <a href="/resources.html">Guides &amp; reports</a>
          <Link to="/#how">How it works</Link>
          <Link to="/#guarantee">Guarantee</Link>
          <Link to="/terms" viewTransition>Terms</Link>
        </nav>
      </div>

      <div className={clsx("container", styles.base)}>
        <span className="mono">© {year} SameDayDesk</span>
        <span className={styles.usco}>Built by Neomorphic LLC.</span>
      </div>
      <p className={clsx("container", styles.related)}>
        SameDayDesk is the operating merchant.{" "}
        <a href="https://ein.llc/">EIN.LLC</a> is a separate formation product.{" "}
        <a href="https://neomorphic.io/">Neomorphic.io</a> is the public experiment lab.
      </p>
    </footer>
  );
}
