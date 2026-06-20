# Stripe — payments, Payment Element & webhooks

Reusable pattern for taking a payment and fulfilling reliably. Distilled from a
production build. Two front-ends are shown — **embedded Payment Element**
(stay on-site) and **hosted Checkout** (redirect) — both with the same
server-authoritative, webhook-backed fulfillment.

---

## Mental model

- **The server owns the money math.** The client never sends an amount. The
  server computes the price, creates the PaymentIntent/Session, and **stamps the
  truth into Stripe `metadata`** (`uid`, line items, totals). Fulfillment reads
  back *that* metadata, not anything the client said.
- **Fulfill on the webhook; verify-on-return as a backup.** The authoritative
  "paid" signal is the **webhook** (`payment_intent.succeeded` /
  `checkout.session.completed`). Because webhooks can lag or be missed, also
  expose a `verify` endpoint the client calls on return — both paths run the
  **same idempotent** fulfillment.
- **Idempotency.** Fulfillment must be safe to run twice (webhook + verify, or
  Stripe retries). Use a deterministic doc id and a transaction so the order is
  created once.
- **Keys:** `pk_…` (publishable, client, public), `sk_…` (secret, server),
  `whsec_…` (webhook signing secret, server). Start in **test mode**, switch to
  live keys for production.

---

## Environment variables

| Var | Side | Notes |
|---|---|---|
| `STRIPE_PUBLISHABLE_KEY` | client (build) | `pk_test_…` / `pk_live_…`. Public. |
| `STRIPE_SECRET_KEY` | server | `sk_test_…` / `sk_live_…`. Secret. |
| `STRIPE_WEBHOOK_SECRET` | server | `whsec_…` from the webhook endpoint. **Required in prod.** |
| `PUBLIC_URL` | server | Origin for `return_url` / `success_url`. |

## Server client

```ts
import Stripe from "stripe";
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" });
```

---

## Flow A — embedded Payment Element (recommended for on-site UX)

### 1. Server: create a PaymentIntent (price computed server-side)

```ts
router.post("/checkout/create-payment-intent", requireAuth, requireVerifiedEmail, async (req, res) => {
  const uid = req.uid!, email = req.userEmail!;
  const pricing = await computePricingServerSide(uid);   // NEVER from req.body
  if (!pricing) return res.status(400).json({ error: "Complete the form first" });

  const intent = await stripe.paymentIntents.create({
    amount: pricing.totalCents,
    currency: "usd",
    receipt_email: email,
    description: `… ${pricing.label}`,
    metadata: { uid, ...pricing.asStrings },             // server-stamped truth
    automatic_payment_methods: { enabled: true },        // cards + wallets + local methods
  });
  res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: pricing.totalCents });
});
```

### 2. Client: mount the Payment Element and confirm

```ts
// lib/stripe.ts — memoized loader
import { loadStripe } from "@stripe/stripe-js";
let p; export const getStripe = () => (p ??= loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY));
```

```tsx
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

function Payment({ clientSecret, returnUrl }) {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret, appearance, fonts, locale: "auto" }}>
      <Form returnUrl={returnUrl} />
    </Elements>
  );
}

function Form({ returnUrl }) {
  const stripe = useStripe(), elements = useElements();
  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",                 // stay on page when no redirect method is used
    });
    if (error) return toast(error.message);
    if (paymentIntent && ["succeeded","processing"].includes(paymentIntent.status)) {
      // hand off to the return page, which calls the verify endpoint
      const u = new URL(returnUrl); u.searchParams.set("payment_intent", paymentIntent.id);
      window.location.href = u.toString();
    }
  };
  return (<form onSubmit={submit}>
    <PaymentElement options={{ layout: "tabs", paymentMethodOrder: ["card","apple_pay","google_pay","paypal"] }} />
    <button disabled={!stripe}>Pay</button>
  </form>);
}
```

Notes:
- **Appearance + fonts:** the Element renders in an iframe and can't see page
  fonts — pass `appearance.variables/rules` and a `fonts:[{ cssSrc }]` entry to
  load webfonts inside it.
- `redirect: "if_required"` keeps card payments on-page; wallet/redirect methods
  (Alipay, etc.) still redirect to `return_url`.

### 3. Client return → server verify (webhook backup)

```ts
router.post("/checkout/verify-payment-intent", requireAuth, async (req, res) => {
  const intent = await stripe.paymentIntents.retrieve(req.body.paymentIntentId);
  if (intent.metadata?.uid !== req.uid) return res.status(403).json({ error: "Not your payment" });
  if (intent.status !== "succeeded") return res.json({ verified: false, status: intent.status });
  await markPaidAndFulfill(req.uid, intent.metadata, intent.amount, req);   // idempotent
  res.json({ verified: true });
});
```

---

## Flow B — hosted Checkout (fastest to ship, Stripe-hosted page)

```ts
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  customer_email: email,
  metadata: { uid, ...pricing.asStrings },
  line_items: [{ price_data: { currency: "usd", unit_amount: pricing.totalCents,
    product_data: { name: pricing.label } }, quantity: 1 }],
  success_url: `${baseUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${baseUrl}/checkout?canceled=true`,
});
res.json({ url: session.url });   // client does window.location.href = url
```

Return page calls a `verify-session` endpoint (retrieve session, check
`payment_status === "paid"` + `metadata.uid === req.uid`, then fulfill).

---

## Webhook (the authoritative path)

**Express wiring — raw body BEFORE `express.json()`** (signature verification
needs the unparsed bytes):

```ts
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
  (req as any).rawBody = req.body; next();
});
app.use(express.json());          // everything else parses JSON normally
```

```ts
router.post("/stripe/webhook", async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(process.env.NODE_ENV === "production" ? 401 : 400).json({ error: "Webhook not configured" });
  let event;
  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody, req.headers["stripe-signature"]!, secret);
  } catch (e) { return res.status(400).json({ error: `Bad signature: ${e.message}` }); }

  if (event.type === "payment_intent.succeeded") await markPaidAndFulfill_fromIntent(event.data.object, req);
  if (event.type === "checkout.session.completed") await markPaidAndFulfill_fromSession(event.data.object, req);
  res.json({ received: true });
});
```

Register the endpoint in the Stripe dashboard (**Developers → Webhooks → Add
endpoint** → `https://yourdomain/api/stripe/webhook`, select
`payment_intent.succeeded` + `checkout.session.completed`) and copy its
`whsec_…` into `STRIPE_WEBHOOK_SECRET`. Test locally with `stripe listen
--forward-to localhost:PORT/api/stripe/webhook`.

## Idempotent fulfillment

```ts
async function markPaidAndFulfill(uid, metadata, amount, req) {
  // 1) flip the user to paid (server-managed field; clients can't write it — see rules)
  await firestore.collection("users").doc(uid).set(
    { paymentStatus: "paid", amountPaid: amount / 100, paidAt: new Date().toISOString() }, { merge: true });

  // 2) create the order exactly once (deterministic id + transaction)
  const orderRef = firestore.collection("orders").doc(`order_${uid}`);
  await firestore.runTransaction(async (tx) => {
    if ((await tx.get(orderRef)).exists) return;          // already fulfilled — no-op
    const pricing = trustPricingFrom(metadata);           // recompute/validate from metadata, not client
    tx.set(orderRef, { uid, ...pricing, status: "received", createdAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  // 3) best-effort notify (don't fail the webhook if this throws)
}
```

---

## Wallets / Apple Pay

Apple Pay needs domain verification: Stripe Dashboard → **Settings → Payment
methods → Apple Pay → Add domain**, then host the file it gives you at
`/.well-known/apple-developer-merchantid-domain-association`. Google Pay / Link
work automatically with `automatic_payment_methods`.

---

## Checklist / gotchas

- [ ] **Never** trust a client-sent amount — compute server-side, stamp into `metadata`.
- [ ] Webhook route uses **raw body** mounted *before* `express.json()`.
- [ ] `STRIPE_WEBHOOK_SECRET` set in prod; reject unsigned webhooks there.
- [ ] Fulfillment is **idempotent** (deterministic id + transaction); webhook *and* verify-return both call it.
- [ ] Gate payment endpoints with `requireAuth` + `requireVerifiedEmail`.
- [ ] Test mode first (`pk_test`/`sk_test` + `stripe listen`), then swap to live keys + live webhook secret.
- [ ] Pass `appearance` + `fonts` to `<Elements>` so the iframe matches your brand.
- [ ] Re-check `paymentStatus` server-side before fulfilling again (avoid double orders / double charge attempts).

See also: `FIREBASE-AUTH-AND-DB.md` (the `paid` flag + rules), `RESEND-EMAIL-SIGNUP-VERIFICATION.md` (receipts/notifications), `DEPLOY-HOSTINGER.md`.
