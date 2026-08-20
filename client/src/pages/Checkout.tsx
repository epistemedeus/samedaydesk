import { useEffect, useState, useMemo, type FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { getStripe } from "../lib/stripe";
import { getSupabase, authedFetch } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTheme, type Theme } from "../lib/theme";
import { ALL_OFFERS } from "../lib/services";
import { track } from "../lib/posthog";
import styles from "./Checkout.module.css";

// The Stripe Payment Element renders in its own iframe, so it can't read our CSS tokens.
// We hand it an appearance that matches the active theme: the dark "Engineered Speed" night
// look, or the light "Drafting Table" paper look (oxide accent, hairline borders, graphite ink).
function appearanceFor(theme: Theme): Appearance {
  if (theme === "drafting") {
    return {
      theme: "flat",
      variables: {
        colorPrimary: "#9e3b2e",
        colorBackground: "#f8f5ee",
        colorText: "#1a1a1a",
        colorTextSecondary: "#55524c",
        colorDanger: "#9e3b2e",
        fontFamily: "Inter, system-ui, sans-serif",
        borderRadius: "9px",
        spacingUnit: "4px",
      },
      rules: {
        ".Tab, .Input, .Block, .CheckboxInput, .CodeInput": { border: "1px solid #c9c4b8" },
        ".Tab:hover": { borderColor: "#b4ae9f" },
        ".Tab--selected, .Tab--selected:focus": { borderColor: "#9e3b2e", boxShadow: "0 0 0 1px #9e3b2e" },
        ".Label": { color: "#55524c" },
        ".Input:focus": { borderColor: "#9e3b2e", boxShadow: "0 0 0 1px #9e3b2e" },
      },
    };
  }
  return {
    theme: "night",
    variables: {
      colorPrimary: "#ccff00",
      colorBackground: "#0f1116",
      colorText: "#f4f4f0",
      colorDanger: "#ff5a4d",
      fontFamily: "Inter, system-ui, sans-serif",
      borderRadius: "9px",
      spacingUnit: "4px",
    },
  };
}

export default function Checkout() {
  const [params] = useSearchParams();
  const slug = params.get("offer") || "resume_linkedin";
  const offer = ALL_OFFERS.find((o) => o.slug === slug) || ALL_OFFERS[0];
  const { user } = useAuth();
  const { theme } = useTheme();
  const appearance = useMemo(() => appearanceFor(theme), [theme]);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authedFetch("/api/checkout/create-payment-intent", {
      method: "POST",
      body: JSON.stringify({ offer: slug }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not start checkout");
        return d;
      })
      .then((d) => {
        if (!active) return;
        setClientSecret(d.clientSecret);
        track("checkout_started", { offer: slug, price: offer.price });
      })
      .catch((e) => active && setErr(e.message));
    return () => {
      active = false;
    };
  }, [slug, offer.price]);

  return (
    <main className={styles.wrap}>
      <Link to="/dashboard" className={styles.back} viewTransition>← Back to your desk</Link>

      <div className={styles.grid}>
        <aside className={styles.summary}>
          <p className="eyebrow">Order summary</p>
          <h1 className={styles.name}>{offer.name}</h1>
          <p className={styles.turn}>{offer.turnaround} · one free revision</p>
          <ul className={styles.includes}>
            {offer.includes.map((i) => (
              <li key={i}><span className={styles.check} aria-hidden="true">›</span> {i}</li>
            ))}
          </ul>
          <div className={styles.total}>
            <span>Total today</span>
            <span className={styles.totalAmt}><span className={styles.cur}>$</span><span className="mono">{offer.price}</span></span>
          </div>
          <p className={styles.guarantee}>Money-back if the first draft isn't right.</p>
        </aside>

        <section className={styles.pay}>
          <Intake uid={user?.id} offer={slug} hint={offer.intake} />

          <h2 className={styles.payHead}>Payment</h2>
          {err && <p className={styles.error} role="alert">{err}</p>}
          {clientSecret ? (
            <Elements stripe={getStripe()} options={{ clientSecret, appearance }}>
              <PayForm />
            </Elements>
          ) : !err ? (
            <p className={styles.loading}>Preparing secure checkout…</p>
          ) : null}
          <p className={styles.secure}>🔒 Payments are processed securely by Stripe. We never see your card details.</p>
        </section>
      </div>
    </main>
  );
}

function Intake({ uid, offer, hint }: { uid?: string; offer: string; hint?: { label: string; placeholder: string; accept: string } }) {
  const label = hint?.label ?? "Target role, job link, or what you need";
  const placeholder = hint?.placeholder ?? "e.g. Senior Customer Success role at a B2B SaaS, here's the posting: …";
  const accept = hint?.accept ?? ".pdf,.doc,.docx,image/*";
  const [details, setDetails] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveDraft(extra: Record<string, unknown> = {}) {
    const sb = await getSupabase();
    if (!sb || !uid) return;
    await sb.from("drafts").upsert(
      { user_id: uid, offer, data: { details }, updated_at: new Date().toISOString(), ...extra },
      { onConflict: "user_id,offer" },
    );
  }

  async function onFile(file?: File) {
    if (!file) return;
    setUploadErr(null);
    setBusy(true);
    try {
      const sb = await getSupabase();
      if (!sb || !uid) throw new Error("Not signed in");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${Date.now()}-${safe}`;
      const { error } = await sb.storage.from("intake-uploads").upload(path, file, { upsert: false });
      if (error) throw error;
      setUploadName(file.name);
      await saveDraft({ upload_path: path });
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.intake}>
      <h2 className={styles.payHead}>Your task</h2>
      <label className={styles.field}>
        <span>{label}</span>
        <textarea
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          onBlur={() => saveDraft()}
          placeholder={placeholder}
        />
      </label>
      <label className={styles.upload}>
        <input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
        <span>{busy ? "Uploading…" : uploadName ? `✓ ${uploadName}` : "Attach your current file (optional)"}</span>
      </label>
      {uploadErr && <p className={styles.error}>{uploadErr}</p>}
    </div>
  );
}

function PayForm() {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/dashboard?paid=1` },
      redirect: "if_required",
    });
    if (error) {
      setErr(error.message || "Payment failed. Please try again.");
      setBusy(false);
      return;
    }
    if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
      track("payment_succeeded", { paymentIntentId: paymentIntent.id });
      await authedFetch("/api/checkout/verify", {
        method: "POST",
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      }).catch(() => {});
      navigate("/dashboard?paid=1", { replace: true });
    } else {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.payForm}>
      <PaymentElement options={{ layout: "tabs" }} />
      {err && <p className={styles.error} role="alert">{err}</p>}
      <button className={styles.payBtn} type="submit" disabled={!stripe || busy}>
        {busy ? "Processing…" : "Pay & send my task"}
      </button>
    </form>
  );
}
