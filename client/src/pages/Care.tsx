import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ALL_OFFERS, PAYMENT_LINKS } from "../lib/services";
import styles from "./Care.module.css";
import { journey } from "../lib/journey";
import Nav from "../components/Nav";
import Footer from "../components/Footer";

type Receipt = {
  title: string; state: string; receivedIntake: boolean; amountCents: number; refundedCents?: number; invoiceUrl?: string;
  subscription?: { cancelAtPeriodEnd: boolean; status: string };
};
const money = (cents: number) => `${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} USD`;
const send = async (action: string, data: object) => {
  const response = await fetch(`/api/care/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data), signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || "Please try the same request again."), { code: payload.code });
  return payload;
};
const redirect = (value: string, host: string) => {
  const url = new URL(value);
  if (url.origin !== `https://${host}`) throw new Error("We could not open that payment page.");
  window.location.assign(url.href);
};

// The buy page sits inside the site (header and footer); receipts keep the bare ticket.
function CareFrame({ title, children, site = false }: { title: string; children: React.ReactNode; site?: boolean }) {
  useEffect(() => {
    const stored = document.title;
    document.title = `${title} | SameDayDesk`;
    return () => { document.title = stored; };
  }, [title]);
  const ticket = <section className={styles.ticket} aria-labelledby="care-title">
    <h1 id="care-title">{title}</h1>
    {children}
  </section>;
  if (site) return <>
    <Nav />
    <main id="main" className={`${styles.shell} ${styles.inSite}`}>{ticket}</main>
    <Footer />
  </>;
  return <main className={styles.shell}>
    <Link className={styles.home} to="/">SameDayDesk</Link>
    {ticket}
  </main>;
}

export function BuyCare() {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  const offer = ALL_OFFERS.find((item) => item.slug === query.get("offer") &&
    PAYMENT_LINKS[item.slug]?.startsWith("/care/buy?"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Invoice methods appear only when the server offers them for this monthly offer.
  const [methods, setMethods] = useState<string[]>(["card"]);
  const [invoiceEmail, setInvoiceEmail] = useState("");
  useEffect(() => {
    if (!offer?.per) return;
    send("methods", { offer: offer.slug }).then((data) => Array.isArray(data.methods) && setMethods(data.methods)).catch(() => {});
  }, [offer?.slug, offer?.per]);
  const payByInvoice = async (method: string) => {
    if (!offer || busy) return;
    setBusy(true); setError("");
    journey("checkout_started", { offer: offer.slug });
    const storeKey = `sds-care-order:${offer.slug}:${method}`;
    try {
      const order = sessionStorage.getItem(storeKey) || crypto.randomUUID();
      sessionStorage.setItem(storeKey, order);
      const result = await send("checkout", { offer: offer.slug, order, method, email: invoiceEmail });
      const receipt = new URL(result.receipt);
      if (receipt.origin !== window.location.origin) throw new Error("We could not open your receipt.");
      window.location.assign(receipt.href);
    } catch (e) {
      journey("checkout_failed", { offer: offer.slug });
      setError(e instanceof Error ? e.message : "The invoice could not open.");
      setBusy(false);
    }
  };
  const buy = async () => {
    if (!offer || busy) return;
    setBusy(true); setError("");
    journey("checkout_started", { offer: offer.slug });
    const storeKey = `sds-care-order:${offer.slug}`;
    try {
      const order = sessionStorage.getItem(storeKey) || crypto.randomUUID();
      sessionStorage.setItem(storeKey, order);
      const result = await send("checkout", { offer: offer.slug, order });
      redirect(result.url, "checkout.stripe.com");
    } catch (e) {
      journey("checkout_failed", { offer: offer.slug });
      if (e instanceof Error && "code" in e && e.code === "checkout_expired") sessionStorage.removeItem(storeKey);
      setError(e instanceof Error ? e.message : "Checkout could not open.");
      setBusy(false);
    }
  };
  return <CareFrame site title={offer?.plain || "Choose a service"}>
    {offer ? <>
      <p>{offer.outcome}</p>
      <p><strong>{offer.price} USD</strong>{offer.per ? " each month" : " once"}</p>
      {offer.per && <p>Billed monthly. Cancel future renewals from your receipt.</p>}
      <dl className={styles.terms}>
        <dt>What you get</dt><dd>{offer.receive.join(". ")}.</dd>
        <dt>When</dt><dd>After payment, tell us what to build or check. Before we start, we write down what must work.</dd>
        <dt>The guarantee</dt><dd>If what we deliver does not do it, we fix it at no extra charge. If we cannot make it work, you get your money back.</dd>
      </dl>
      {query.get("left") === "1" && <p role="status">You left checkout. Continue there to finish.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void buy()}>
        {busy ? "Opening checkout" : `Continue to pay ${offer.price} USD`}
      </button>
      {methods.length > 1 && <form className={`${styles.form} ${styles.alternate}`} onSubmit={(event) => event.preventDefault()}>
        <p>Or pay each month by invoice, by bank transfer (international wires accepted){methods.includes("stablecoin") ? " or in USDC" : ""}.</p>
        <label>Email for your invoice<input type="email" required maxLength={254} value={invoiceEmail}
          onChange={(event) => setInvoiceEmail(event.target.value)} /></label>
        {methods.includes("bank_transfer") && <button type="button" disabled={busy || !invoiceEmail}
          onClick={() => void payByInvoice("bank_transfer")}>Pay by bank transfer</button>}
        {methods.includes("stablecoin") && <button type="button" disabled={busy || !invoiceEmail}
          onClick={() => void payByInvoice("stablecoin")}>Pay in USDC</button>}
      </form>}
    </> : <Link to="/#services">See services</Link>}
  </CareFrame>;
}

export function CareReceipt({ mode }: { mode: "intake" | "cancel" }) {
  const [access] = useState(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));
    const order = values.get("order"), key = values.get("key");
    const storeKey = `sds-care-receipt:${mode}`;
    if (order && key) {
      try { sessionStorage.setItem(storeKey, JSON.stringify({ order, key })); } catch { /* the initial visit still works */ }
      return { order, key };
    }
    try { return JSON.parse(sessionStorage.getItem(storeKey) || "null") || { order: null, key: null }; }
    catch { return { order: null, key: null }; }
  });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasLink = Boolean(access.order && access.key);
  async function run(action: string, extra = {}) {
    setBusy(true); setError("");
    try {
      const data = await send(action, { ...access, ...extra });
      if (action === "receipt") {
        journey("receipt_opened", { offer: data.offer, state: data.state });
        setReceipt(data);
        if (data.state === "paid") sessionStorage.removeItem(`sds-care-order:${data.offer}`);
      } else if (action === "intake") {
        journey("form_sent", { state: "intake" });
        setMessage("We received your workflow. Keep this receipt for your records.");
      } else if (data.canceled) setMessage("Your subscription will not renew.");
      else redirect(data.url, "billing.stripe.com");
    } catch (e) {
      if (action === "intake") journey("form_failed", { state: "intake" });
      setError(e instanceof Error ? e.message : "Please try again.");
    }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(history.state, "", location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the receipt once per mount from the capability link
    if (hasLink && mode === "intake") void run("receipt");
    // The capability is fixed for this mount. Never read it from query parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLink, mode]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run("intake", { intake: Object.fromEntries(values) });
  }
  return <CareFrame title={mode === "cancel" ? "Manage your subscription" : receipt?.title || "Your receipt"}>
    {!hasLink && <p>Open the link from your receipt to continue.</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {mode === "cancel" && hasLink && !message && <button disabled={busy} onClick={() => void run("subscription")}>
      {busy ? "Opening Stripe" : "Manage renewal on Stripe"}
    </button>}
    {mode === "intake" && hasLink && !receipt && !error && <p role="status">Opening your receipt</p>}
    {mode === "intake" && hasLink && (error || receipt?.state === "created") && <>
      {receipt?.state === "created" && <p role="status">Waiting for payment confirmation.</p>}
      {receipt?.state === "created" && receipt.invoiceUrl && <p><a href={receipt.invoiceUrl}>Pay your invoice on Stripe</a></p>}
      <button disabled={busy} onClick={() => void run("receipt")}>Check payment status</button>
    </>}
    {receipt?.state === "expired" && <p>This checkout expired. No payment was confirmed.</p>}
    {receipt?.state === "refunded" && <p>Payment refunded.</p>}
    {receipt?.state === "review" && <p>We are reviewing this order. Reply to your receipt if you need help.</p>}
    {receipt?.state === "paid" && <>
      <p>Paid: {money(receipt.amountCents)}{receipt.subscription ? " for the first month" : ""}.</p>
      {/* A refunded month keeps the subscription; the refund still shows here. */}
      {Boolean(receipt.refundedCents) && <p>Refunded: {money(receipt.refundedCents!)}.</p>}
      {receipt.subscription?.cancelAtPeriodEnd && <p>Your subscription will not renew.</p>}
      {receipt.receivedIntake && <p role="status">We received your workflow.</p>}
      {!receipt.receivedIntake && !message && <form className={styles.form} onSubmit={submit}>
        <label>Website, tool or workflow<input name="surface" maxLength={400} required /></label>
        <label>What should work?<textarea name="outcome" minLength={12} maxLength={1200} required /></label>
        <label>Release page, if you have one<input name="releaseChannel" maxLength={400} /></label>
        <button disabled={busy} type="submit">Send your workflow</button>
      </form>}
    </>}
  </CareFrame>;
}
