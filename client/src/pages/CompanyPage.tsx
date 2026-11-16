import Nav from "../components/Nav";
import Footer from "../components/Footer";
import styles from "./CompanyPage.module.css";

// Company furniture: short, factual, dated.
const PAGES = {
  about: {
    title: "About SameDayDesk",
    rows: [
      ["What we do", "Flat fee builds that make a service usable and payable by AI agents, each with an acceptance test, and paid machine routes on our own gateway."],
      ["How we work", "A bounded scope and a fixed price before work starts. The agreed test passes, or the work is repaired; a repair that cannot pass is refunded."],
      ["Contact", "contact@samedaydesk.com, read by a person."],
      ["Related", "EIN.LLC is a separate formation product. It is not a SameDayDesk service."],
    ],
  },
  security: {
    title: "Security and trust",
    rows: [
      ["Payments", "Builds are paid through Stripe-hosted links. Machine routes take USDC on Base over x402; a replayed payment changes nothing and an unknown outcome is never retried for you."],
      ["Credentials", "We never ask for a password, a card number or an API key in a chat with an agent. Access for a build is scoped and removed at handoff."],
      ["Evidence", "Settlements are reconciled and published as counts on the gateway's health document; receipts are linked from the homepage."],
      ["Report a problem", "contact@samedaydesk.com with the subject \"Security\"."],
    ],
  },
  changelog: {
    title: "Changelog",
    rows: [
      ["2026-11-16", "Homepage: the quick start for agents, the free check printed as a receipt, the builds compared in one table, live gateway figures."],
      ["2026-11-16", "Agents: /start.md tells an agent what it can do here."],
    ],
  },
} as const;

export default function CompanyPage({ kind }: { kind: keyof typeof PAGES }) {
  const page = PAGES[kind];
  return (
    <>
      <Nav />
      <main id="main" className={`container ${styles.wrap}`}>
        <p className="eyebrow">Company</p>
        <h1 className={styles.h1}>{page.title}</h1>
        <dl className={styles.list}>
          {page.rows.map(([k, v]) => (<div key={k + v} className={styles.row}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>
      </main>
      <Footer />
    </>
  );
}
