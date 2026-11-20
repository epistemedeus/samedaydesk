import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import StubPage from "./StubPage";
import { RECEIPTS, tapeShown, utcTime, type Receipt } from "../lib/receipts";
import { longDate, receiptHeading, receiptId } from "../data/receiptPages.mjs";
import styles from "./ReceiptPage.module.css";

// One entry of the tape on its own page. Delivered work: what was done, for whom (named only
// where the work is public), the amount, and the proof. A paid call: the payment as Base recorded
// it, decoded from the transaction, and the one request anyone can send to see the same log.
export default function ReceiptPage() {
  const { id } = useParams();
  const r = RECEIPTS.find((entry) => receiptId(entry) === id);
  useEffect(() => {
    if (!r) return;
    const previous = document.title;
    document.title = `Receipt ${id} | SameDayDesk`;
    return () => { document.title = previous; };
  }, [r, id]);
  if (!r || !tapeShown()) return <StubPage title="Not found" note="That receipt doesn't exist." notFound />;
  const work = r.kind === "delivered";
  return (
    <>
      <Nav />
      <main id="main" className={styles.wrap}>
        <p className="eyebrow">Receipt</p>
        <article className={styles.slip}>
          <p className={styles.head}><span>SameDayDesk</span><span>{longDate(r.date)}{r.time ? ` · ${utcTime(r.time)}` : ""}</span></p>
          <h1 className={styles.h1}>{receiptHeading(r)}</h1>
          {work ? <Work r={r} /> : <Call r={r} />}
          <p className={styles.proof}>
            <span className={styles.ref}>No. {id}</span>
            <a href={r.proof} target="_blank" rel="noopener noreferrer">{work ? "The proof" : "The transaction on Basescan"} <span aria-hidden="true">↗</span></a>
            {r.more && <a href={r.more} target="_blank" rel="noopener noreferrer">The work itself <span aria-hidden="true">↗</span></a>}
          </p>
        </article>
        {!work && r.check && <Check r={r} />}
        <p className={styles.back}><Link to="/receipts">All receipts</Link></p>
      </main>
      <Footer />
    </>
  );
}

function Work({ r }: { r: Receipt }) {
  return (
    <dl className={styles.lines}>
      <div><dt>Delivered</dt><dd>{r.delivered}</dd></div>
      {r.amount && <div><dt>Paid</dt><dd>{r.amount} on {r.rail}{r.paidHow ? `, ${r.paidHow}` : ""}</dd></div>}
    </dl>
  );
}

// "1788103430" -> "18 Aug 2026, 10:43 UTC"; "0" -> "any time".
const unix = (s: string) => {
  if (s === "0") return "any time";
  const d = new Date(Number(s) * 1000).toISOString();
  return `${longDate(d.slice(0, 10))}, ${d.slice(11, 16)} UTC`;
};

function Call({ r }: { r: Receipt }) {
  const c = r.chain!;
  const a = c.authorization;
  const units = Number(a.value);
  return (
    <>
      <dl className={styles.lines}>
        <div><dt>Bought</dt><dd>{r.tool ? <><span className="mono">{r.tool.name}</span>: {r.tool.what}</> : "A call to the gateway. No receiving record joins this payment to a route, so none is named."}</dd></div>
        <div><dt>Paid</dt><dd>{r.amount} on Base, over x402</dd></div>
        <div>
          <dt>Payer</dt>
          <dd>
            <span className="mono">{r.payer!.address}</span>
            {r.payer!.class === "independent"
              ? <span className={styles.mark}>Independent · {r.payer!.label}</span>
              : <span className={styles.note}>We don't know who controls this wallet, and make no claim about it.</span>}
            {r.payer!.who && <span className={styles.note}>{r.payer!.who}.</span>}
          </dd>
        </div>
      </dl>

      <h2 className={styles.h2}>As Base recorded it</h2>
      <p className={styles.verified}><span className={styles.seal} aria-hidden="true" />Verified on Base, read from the chain on {longDate(c.verifiedAt.slice(0, 10))}: the transaction succeeded and its log matches.</p>
      <dl className={`${styles.lines} ${styles.chain}`}>
        <div><dt>Transaction</dt><dd className="mono">{c.transactionHash}</dd></div>
        <div><dt>Block</dt><dd><span className="mono">{c.blockNumber.toLocaleString("en-US")}</span>, {longDate(c.blockTime.slice(0, 10))} {utcTime(c.blockTime)}</dd></div>
        <div><dt>Log index</dt><dd className="mono">{c.logIndex}</dd></div>
        <div><dt>Submitted by</dt><dd><span className="mono">{c.submittedBy}</span><span className={styles.note}>The facilitator that sent the payer's signed authorization to the chain.</span></dd></div>
        <div><dt>Call</dt><dd><span className="mono">{c.method}</span> on USDC (<span className="mono">{c.tokenContract}</span>)</dd></div>
      </dl>
      <p className={styles.caption} id="auth-title">The payer's signed authorization, decoded from the call</p>
      <dl className={`${styles.lines} ${styles.chain} ${styles.auth}`} aria-labelledby="auth-title">
        <div><dt>from</dt><dd className="mono">{a.from}</dd></div>
        <div><dt>to</dt><dd className="mono">{a.to}<span className={styles.note}>The SameDayDesk gateway's payout address.</span></dd></div>
        <div><dt>value</dt><dd><span className="mono">{a.value}</span> ({units / 1e6} USDC, six decimals)</dd></div>
        <div><dt>validAfter</dt><dd><span className="mono">{a.validAfter}</span> ({unix(a.validAfter)})</dd></div>
        <div><dt>validBefore</dt><dd><span className="mono">{a.validBefore}</span> ({unix(a.validBefore)})</dd></div>
        <div><dt>nonce</dt><dd className="mono">{a.nonce}</dd></div>
      </dl>
    </>
  );
}

function Check({ r }: { r: Receipt }) {
  const [copied, setCopied] = useState(false);
  // One argument per line and one JSON field per line, so the box wraps nothing but the hash.
  const fields = Object.entries(r.check!.request as Record<string, unknown>);
  const body = fields.map(([k, v]) => Array.isArray(v)
    ? `    ${JSON.stringify(k)}: [\n${v.map((x) => `      ${JSON.stringify(x)}`).join(",\n")}\n    ]`
    : `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  const command = `curl -s ${r.check!.rpc} \\\n  -H 'content-type: application/json' \\\n  -d '{\n${body}\n  }'`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select by hand */ }
  };
  return (
    <section className={styles.check} aria-labelledby="check-title">
      <h2 id="check-title" className={styles.h2}>Check it yourself</h2>
      <p>Ask Base's public endpoint for the transaction's receipt. No account or key.</p>
      <div className={styles.cmd}>
        <p className={styles.cmdBar}><span>Terminal</span><button type="button" onClick={copy} className={styles.copy}>{copied ? "Copied" : "Copy"}</button></p>
        <pre><code>{command.split("\n").map((line, i) => {
          // Each line keeps its indent when it wraps, so a long hash stays under its own line.
          const indent = line.length - line.trimStart().length;
          return <span key={i} className={styles.cmdLine} style={{ paddingInlineStart: `${indent}ch` }}>{line.trimStart()}{"\n"}</span>;
        })}</code></pre>
      </div>
      <p>You should see <span className="mono">"status": "0x1"</span> and {r.check!.expect}.</p>
      <p><a href={r.proof} target="_blank" rel="noopener noreferrer">Or open it on Basescan <span aria-hidden="true">↗</span></a></p>
    </section>
  );
}
