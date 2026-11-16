import { useEffect, useState } from "react";
import snapshot from "../data/proof-snapshot";
import { WIRE_SOURCE } from "../data/wire";
import styles from "./ProofStrip.module.css";

// Live figures from the paid gateway, read through /api/proof. The dated
// snapshot is in the page source first; each figure links to its source.
type Proof = Omit<typeof snapshot, "lastReconciledAt"> & { lastReconciledAt: string | null };

export default function ProofStrip() {
  const [p, setP] = useState<Proof>(snapshot);
  const [live, setLive] = useState(false);
  useEffect(() => {
    fetch("/api/proof").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && typeof d.settlements === "number") { setP({ ...snapshot, ...d }); setLive(true); } }).catch(() => {});
  }, []);
  const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "not read");
  return (
    <section id="proof" className={styles.strip} aria-label="Proof from the paid gateway">
      <div className={`container ${styles.row}`}>
        <a className={styles.cell} href={p.source}><b>{p.settlements}</b><span>settlements reconciled, {p.internalSettlements} of them our own</span></a>
        <a className={styles.cell} href="https://agents.samedaydesk.com/.well-known/x402"><b>{p.x402Routes}</b><span>paid x402 routes on Base</span></a>
        <a className={styles.cell} href={p.source}><b className={styles.small}>{when(p.lastReconciledAt)}</b><span>last reconciliation</span></a>
        <a className={styles.cell} href={WIRE_SOURCE}><b className={styles.small}>2026-08-29</b><span>latest published receipt</span></a>
        <p className={styles.note}>{live ? "Read live from the gateway." : `Snapshot of ${p.readAt.slice(0, 10)}.`}</p>
      </div>
    </section>
  );
}
