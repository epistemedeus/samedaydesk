import { Link } from "react-router-dom";
import clsx from "clsx";
import BrandMark from "./BrandMark";
import styles from "./Footer.module.css";

// The homepage and the money pages are static documents served ahead of this SPA, so links
// to them are plain anchors (a full navigation), not router Links.
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={clsx("container", styles.inner)}>
        <div className={styles.brandCol}>
          <a href="/" className={styles.brand} aria-label="SameDayDesk home">
            <BrandMark className={styles.mark} /> SameDayDesk
          </a>
          <p className={styles.tag}>We correct what AI answers say about your business.</p>
          <a className={styles.contact} href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>
        </div>

        <nav className={styles.col} aria-label="Offers">
          <h3 className={styles.colhead}>Offers</h3>
          <a href="/report">Free AI Answer Report</a>
          <a href="/pay/audit">AI Answer Audit</a>
          <a href="/pay/sprint">Answer Correction Sprint</a>
          <a href="/pay/sprint-plus">Correction Sprint Plus</a>
        </nav>

        <nav className={styles.col} aria-label="Proof and documentation">
          <h3 className={styles.colhead}>Proof and docs</h3>
          <a href="/audit/samedaydesk/2026-08-19/">Published self-audit</a>
          <a href="/methods">Methods</a>
          <a href="/for-agents">For agents</a>
          <Link to="/tools/ai-readiness" viewTransition>Free readiness checker</Link>
          <a href="/resources.html">Guides and reports</a>
          <a href="/terms">Terms</a>
        </nav>
      </div>

      <div className={clsx("container", styles.base)}>
        <span className="mono">{year} SameDayDesk</span>
        <span className={styles.usco}>Neomorphic LLC, Sheridan, Wyoming. Operated by Lucian Constantinescu.</span>
      </div>
    </footer>
  );
}
