# 04 — Stripe Integration + End-to-End Sandbox Test Plan (SameDayDesk)

**Scope:** Current (2025–2026) Stripe integration for samedaydesk.com — (a) embedded **Payment Element** checkout on-site for the 5 productized offers, and (b) **Payment Links** (including an operator-sendable "instant payment link"), plus a concrete, ordered **end-to-end sandbox test checklist** an autonomous browser agent can execute.

**Researched:** 2026-06-20. All version numbers and APIs verified against Stripe docs / `stripe-node` CHANGELOG as of this date.

**Connected sandbox (confirmed live during research):** Stripe MCP is authenticated to **`Neomorphic LLC sandbox`** → account `acct_1SAPeUPwY9LS48U1`. API keys: https://dashboard.stripe.com/acct_1SAPeUPwY9LS48U1/apikeys. This is the exact test account the builder will use — no new account registration is required.

---

## 0. TL;DR for the builder

- **Node SDK:** `stripe@22.2.2` (latest, 2026-06-18). Pin `apiVersion: "2026-05-27.dahlia"` (the version this SDK ships with). The existing playbook pins `2026-02-25.clover` — **bump it to `2026-05-27.dahlia`** to match the current SDK. Client: `@stripe/stripe-js` + `@stripe/react-stripe-js` (latest).
- **Two integrations, one fulfillment path:** on-site **Payment Element** (PaymentIntent → `payment_intent.succeeded`) for the main checkout; **Payment Links** (hosted → `checkout.session.completed`) for the "send a client a link" operator flow. Both converge on one **idempotent** `fulfill()` function.
- **Server owns the money math.** Client never sends an amount. Server computes price from the selected offer slug, creates the PaymentIntent/Link/Session, stamps `metadata` (`uid`, `offer`, `amount`), and fulfillment reads back *that metadata*.
- **Webhooks are authoritative.** Raw body + signature verification. Subscribe to `payment_intent.succeeded` + `checkout.session.completed` (+ `checkout.session.async_payment_succeeded` for delayed methods). Verify-on-return is a backup that calls the same idempotent fulfill.
- **Test everything in the connected sandbox** with `stripe listen`/`stripe trigger`, test card `4242 4242 4242 4242`, 3DS card `4000 0027 6000 3184`, decline `4000 0000 0000 0002`. The Stripe MCP (`stripe_api_write`) can create Products/Prices/Payment Links directly.
- **Live swap = environment variables only:** `pk_test_…`/`sk_test_…`/`whsec_…` → `pk_live_…`/`sk_live_…`/live `whsec_…`. No code change. Re-register the production domain for Apple Pay/Link.

---

## 1. Current versions & API pin (2026)

| Component | Current (2026-06) | Notes |
|---|---|---|
| **Stripe API version** | `2026-05-27.dahlia` | Latest released version string. Stripe ships a new monthly version (no breaking changes) and twice-yearly breaking releases since `2024-09-30.acacia`. Codename progression: acacia → … → clover → **dahlia**. |
| **`stripe` (Node SDK)** | **22.2.2** (2026-06-18) | Recent line: 22.2.2 (06-18), 22.2.1 (06-12), 22.2.0 (05-27, first to pin `2026-05-27.dahlia`), 22.1.x (`2026-04-22.dahlia`), 22.0.2 (`2026-03-25.dahlia`). |
| **Node runtime** | Node 18+ (LTS even) | SDK supports all current LTS Node 18+; 20/22/24 fine. Single-process Express + Vite SPA is supported. |
| `@stripe/stripe-js` | latest | `loadStripe()` loader for Stripe.js (Elements). |
| `@stripe/react-stripe-js` | latest | `<Elements>`, `<PaymentElement>`, `useStripe`, `useElements`. |
| **Stripe CLI** | latest | `stripe listen` / `stripe trigger` / `stripe sandbox create`. Install via Homebrew (`brew install stripe/stripe-cli/stripe`) or `npm i -g @stripe/cli`. |

**Server client (bump the pin):**
```ts
import Stripe from "stripe";
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-05-27.dahlia",   // matches stripe@22.2.x
});
```

> **Sources:** [Stripe SDK versioning & support](https://docs.stripe.com/sdks/versioning?lang=node) · [stripe-node CHANGELOG](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md) · [stripe on npm](https://www.npmjs.com/package/stripe)

**API-version gotcha:** Pinning in the SDK constructor controls the shape of API *responses* your server reads. **Webhook event payloads** are rendered with the API version configured on the *webhook endpoint* (Dashboard) or your account default — keep them aligned, or read fields defensively. When you don't pass `apiVersion`, the SDK uses the version it was built against (`2026-05-27.dahlia` for 22.2.x).

---

## 2. Architecture decision: Payment Element vs Checkout Sessions vs Payment Intents

Stripe's current guidance (surfaced verbatim by the docs to coding agents): **"Stripe recommends using the Checkout Sessions API with the Payment Element over Payment Intents for most integrations… Don't use the Payment Intent API unless the user explicitly asks, because it requires significantly more code."**

For SameDayDesk we deliberately use **both** patterns because the requirements explicitly ask for them:

| Need | API | Front-end |
|---|---|---|
| **On-site embedded checkout** for the 5 offers, stay-on-page UX, full brand control | **PaymentIntent + Payment Element** (the project's existing playbook pattern; server owns the amount; `redirect: "if_required"`) | `<Elements>` + `<PaymentElement>` in the Vite SPA |
| **Operator "instant payment link"** to send a client (no code at send-time) | **Payment Links** (built on Checkout Sessions, Stripe-hosted) | Hosted Stripe page; share `link.url` |
| (Alternative / fastest-to-ship on-site) | **Checkout Session** (`mode: "payment"`), redirect or embedded | Hosted page or embedded component |

**Recommendation:** Ship the **PaymentIntent + Payment Element** on-site checkout (matches `STRIPE-PAYMENTS-AND-ELEMENTS.md`) as the primary flow, and **Payment Links** for the operator-send flow. Both fulfill through the same webhook-backed idempotent function. If the agent wants the least code for the on-site path, the Checkout Session variant is a drop-in alternative that fulfills on `checkout.session.completed` — same as Payment Links — which simplifies to a single fulfillment branch.

> **Sources:** [Stripe Web Elements / compatible APIs](https://docs.stripe.com/payments/elements) · [Advanced (Payment Intents) integration](https://docs.stripe.com/payments/quickstart) · [Checkout Sessions quickstart](https://docs.stripe.com/payments/quickstart-checkout-sessions)

---

## 3. The 5 offers → Products / Prices map

All amounts in **cents, USD**. Create one **Product** per offer and one one-time **Price** each. Stamp a stable `offer` slug into product/price `metadata` and into every PaymentIntent/Session so fulfillment is server-authoritative.

| Offer | Slug | Price (USD) | `unit_amount` (cents) | Product `metadata` |
|---|---|---|---|---|
| Resume + LinkedIn rewrite (flagship) | `resume_linkedin` | $59 | `5900` | `{offer: resume_linkedin, sla: same_day}` |
| Cover Letter | `cover_letter` | $39 | `3900` | `{offer: cover_letter}` |
| Landing-page copy | `landing_copy` | $69 | `6900` | `{offer: landing_copy}` |
| Resume + LinkedIn + Cover Letter bundle | `bundle_all` | $79 | `7900` | `{offer: bundle_all}` |
| Custom code / data-cleanup | `custom_quote` | (variable) | n/a — `price_data` per quote | `{offer: custom_quote, quote: true}` |

- **Offers 1–4** are fixed-price → create a reusable **Price** object once; reference `price.id` in Payment Links and (optionally) Checkout `line_items`. For the **PaymentIntent** flow, the server still computes `unit_amount` from the slug (PaymentIntents take a raw `amount`, not a `price`).
- **Offer 5 (custom quote)** has no fixed Price. Generate an **ad-hoc Payment Link or Checkout Session with `price_data`** (inline `unit_amount`) at quote time, or create a one-off Price. This is the natural home for the **"instant payment link the operator sends a client."**
- **Free teaser:** no Stripe object — gate it behind auth only, no charge.
- **Money-back guarantee:** implemented via Stripe **Refunds** (`stripe.refunds.create({ payment_intent })` or MCP `create_refund`), not at checkout time.

**Create via Node (run once, idempotent by checking for existing products first):**
```ts
const OFFERS = [
  { slug: "resume_linkedin", name: "Resume + LinkedIn rewrite", amount: 5900 },
  { slug: "cover_letter",    name: "Cover Letter",              amount: 3900 },
  { slug: "landing_copy",    name: "Landing-page copy",         amount: 6900 },
  { slug: "bundle_all",      name: "Resume + LinkedIn + Cover Letter bundle", amount: 7900 },
];
for (const o of OFFERS) {
  const product = await stripe.products.create({ name: o.name, metadata: { offer: o.slug } });
  const price = await stripe.prices.create({
    currency: "usd", unit_amount: o.amount, product: product.id, metadata: { offer: o.slug },
  });
  console.log(o.slug, product.id, price.id);
}
```

**Create via Stripe MCP (no script needed):** call `stripe_api_write` (or the higher-level product/price tools) against the connected `Neomorphic LLC sandbox` to create each Product + Price, then a Payment Link per offer. The MCP is already authenticated to the right test account, so the agent can do this without API keys in hand.

---

## 4. Flow A — embedded Payment Element (primary on-site checkout)

### 4.1 Server: create the PaymentIntent (price computed server-side, metadata stamped)
```ts
router.post("/api/checkout/create-payment-intent", requireAuth, requireVerifiedEmail, async (req, res) => {
  const uid = req.uid, email = req.userEmail;
  const { offer } = req.body;                         // slug ONLY, never an amount
  const amount = AMOUNTS[offer];                       // server-side lookup; reject unknown
  if (!amount) return res.status(400).json({ error: "Unknown offer" });

  const intent = await stripe.paymentIntents.create({
    amount, currency: "usd", receipt_email: email,
    description: `SameDayDesk — ${offer}`,
    metadata: { uid, offer, amount: String(amount) },  // server-stamped truth
    automatic_payment_methods: { enabled: true },      // cards + wallets + Link + local methods
  });
  res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount });
});
```

### 4.2 Client: mount Payment Element, confirm with `redirect: "if_required"`
```tsx
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Wrap with <Elements stripe={stripePromise} options={{ clientSecret, appearance, fonts, locale: "auto" }}>
function CheckoutForm({ returnUrl }) {
  const stripe = useStripe(), elements = useElements();
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },   // used only by redirect methods
      redirect: "if_required",                    // cards/wallets stay on-page
    });
    if (error) return showError(error.message);
    if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
      // success on-page → call the verify endpoint (webhook backup)
      window.location.href = `${returnUrl}?payment_intent=${paymentIntent.id}`;
    }
  };
  return (
    <form onSubmit={onSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />
      <button disabled={!stripe}>Pay</button>
    </form>
  );
}
```

**`redirect: "if_required"` semantics (verified):** with `redirect: "if_required"`, `confirmPayment` resolves in-place for card/wallet payments (no navigation); the returned `paymentIntent.status` is `succeeded` on success. Only redirect-based methods (e.g. some BNPL/bank-redirect) actually navigate to `return_url`. This is the right setting for an on-site, stay-on-page UX.

**Appearance/fonts gotcha:** the Payment Element renders inside an iframe that can't see your page CSS/fonts. Pass `options.appearance` (Appearance API variables/rules) and `options.fonts: [{ cssSrc }]` to `<Elements>` so it matches the award-worthy brand.

### 4.3 Client return → server verify (idempotent backup)
```ts
router.post("/api/checkout/verify-payment-intent", requireAuth, async (req, res) => {
  const intent = await stripe.paymentIntents.retrieve(req.body.paymentIntentId);
  if (intent.metadata?.uid !== req.uid) return res.status(403).json({ error: "Not your payment" });
  if (intent.status !== "succeeded") return res.json({ verified: false, status: intent.status });
  await fulfill(intent.metadata, intent.amount);      // SAME idempotent fn as the webhook
  res.json({ verified: true });
});
```

> **Sources:** [Build an advanced integration (Payment Element + PaymentIntent)](https://docs.stripe.com/payments/quickstart) · [`stripe.confirmPayment` reference](https://docs.stripe.com/js/payment_intents/confirm_payment) · [Payment status / verifying status](https://docs.stripe.com/payments/payment-intents/verifying-status)

---

## 5. Flow B — Payment Links (incl. operator "instant payment link")

A **Payment Link** is a shareable, Stripe-hosted URL backed by a Checkout Session. Create once per fixed offer and reuse the URL; create on-the-fly for custom quotes.

### 5.1 Reusable per-offer links (fixed offers 1–4)
```ts
const link = await stripe.paymentLinks.create({
  line_items: [{ price: priceId /* from §3 */, quantity: 1 }],
  metadata: { offer: "resume_linkedin" },                 // stamped on the LINK
  payment_intent_data: { metadata: { offer: "resume_linkedin" } }, // also on the PI (so PI webhooks see it)
  after_completion: { type: "redirect", redirect: { url: "https://samedaydesk.com/thanks?cs={CHECKOUT_SESSION_ID}" } },
});
console.log(link.url);   // https://buy.stripe.com/... — share via email/SMS
```

### 5.2 "Instant payment link" the operator sends a client (custom quote / ad-hoc amount)
For offer 5 or any custom amount, create a link with inline `price_data` so no Price object is needed:
```ts
const product = await stripe.products.create({ name: "SameDayDesk — Custom quote #1042" });
const link = await stripe.paymentLinks.create({
  line_items: [{
    price_data: { currency: "usd", unit_amount: 12500, product: product.id }, // $125.00 quote
    quantity: 1,
    adjustable_quantity: { enabled: false },
  }],
  metadata: { offer: "custom_quote", quote_id: "1042", client_email: "client@example.com" },
  payment_intent_data: { metadata: { offer: "custom_quote", quote_id: "1042" } },
  after_completion: { type: "redirect", redirect: { url: "https://samedaydesk.com/thanks?cs={CHECKOUT_SESSION_ID}" } },
});
// Operator sends link.url to the client (Resend email, SMS, copy-paste).
```
The Stripe MCP can do this directly (`stripe_api_write` against `payment_links`) without writing server code — useful for a true "operator clicks a button, link appears" workflow, or the agent can build a small `/api/operator/instant-link` endpoint that wraps the above.

**Key Payment-Link options:**
- `metadata` — stamped on the link; also pass `payment_intent_data.metadata` so the resulting PaymentIntent carries it (important if you also listen to `payment_intent.succeeded`).
- `after_completion` — `{ type: "redirect", redirect: { url } }` or `{ type: "hosted_confirmation" }`. Use `{CHECKOUT_SESSION_ID}` placeholder in the redirect URL.
- `adjustable_quantity` — let buyers change quantity (leave off for single deliverables).
- `restrictions.completed_sessions.limit` — make a link single-use (great for one-client instant links).
- `inactive: true` later to deactivate a link.

**What fires when a Payment Link is paid:** `checkout.session.completed` (the link spawns a Checkout Session). For immediate methods `payment_status === "paid"` on that event; the underlying PaymentIntent also emits `payment_intent.succeeded`. Fulfill on `checkout.session.completed` (and `checkout.session.async_payment_succeeded` for delayed methods).

> **Sources:** [Payment Links API](https://docs.stripe.com/payment-links/api) · [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)

---

## 6. Webhooks (authoritative path)

### 6.1 Express wiring — raw body BEFORE `express.json()`
Signature verification needs the **unparsed bytes**. Mount the webhook route with `express.raw` *before* the global JSON parser:
```ts
// Mount raw parser ONLY for the webhook path, before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), webhookHandler);
app.use(express.json());   // everything else parses JSON normally
```

### 6.2 Handler — verify signature, branch on event, fulfill, return 2xx fast
```ts
async function webhookHandler(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(process.env.NODE_ENV === "production" ? 401 : 400).json({ error: "Webhook not configured" });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                                // RAW Buffer (do not JSON.parse)
      req.headers["stripe-signature"],
      secret,                                  // whsec_…
    );
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);   // bad signature
  }

  // Acknowledge fast; do heavy work idempotently.
  switch (event.type) {
    case "payment_intent.succeeded":
      await fulfill(event.data.object.metadata, event.data.object.amount, { piId: event.data.object.id });
      break;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status === "paid") await fulfillFromSession(s.id);
      break;
    }
    // payment_intent.payment_failed → optional: log / notify
  }
  res.json({ received: true });
}
```

### 6.3 Which events to subscribe to
| Event | When it fires | Use |
|---|---|---|
| `payment_intent.succeeded` | On-site Payment Element payment succeeds | **Fulfill** (Flow A) |
| `checkout.session.completed` | Payment Link / Checkout Session completes (immediate methods → `payment_status: paid`) | **Fulfill** (Flow B) |
| `checkout.session.async_payment_succeeded` | Delayed method (ACH/bank) later settles | Fulfill delayed |
| `payment_intent.payment_failed` | Card declined / auth failed | Log / notify (optional) |
| `charge.refunded` | Money-back guarantee refund issued | Reverse fulfillment / mark refunded (optional) |

**Best practices (verified):** return a **2xx quickly** (do slow work async or after responding); **verify the signature** on every event; treat events as **at-least-once** (Stripe retries) → fulfillment must be idempotent; the same `event.id` can arrive more than once. Register the endpoint at **Developers → Webhooks → Add endpoint** → `https://samedaydesk.com/api/stripe/webhook`, select the events above, and copy the `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

> **Sources:** [Webhooks](https://docs.stripe.com/webhooks) · [Webhook signature verification](https://docs.stripe.com/webhooks/signature) · [Checkout fulfillment (events + idempotency)](https://docs.stripe.com/checkout/fulfillment)

---

## 7. Idempotent fulfillment (one function, two callers)

Both the webhook and the verify-on-return endpoint call the **same** function. It must be safe to run twice (webhook + verify, or Stripe retries).

```ts
// Deterministic doc id + transaction = "fulfill exactly once"
async function fulfill(metadata, amountCents, ctx) {
  const uid = metadata?.uid;
  const offer = metadata?.offer;
  if (!uid || !offer) return;                         // nothing to do (e.g. CLI-triggered fixture)

  // 1) flip the user to paid (server-managed; clients can't write this — default-deny rules)
  await firestore.collection("users").doc(uid).set(
    { paymentStatus: "paid", paidAt: new Date().toISOString() }, { merge: true });

  // 2) create the order exactly once
  const orderRef = firestore.collection("orders").doc(`order_${uid}_${offer}`);  // deterministic id
  await firestore.runTransaction(async (tx) => {
    if ((await tx.get(orderRef)).exists) return;       // already fulfilled → no-op
    const expected = AMOUNTS[offer];                   // re-validate price from slug, not from client
    tx.set(orderRef, {
      uid, offer, amount: amountCents, priceOk: amountCents === expected,
      status: "received", createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  // 3) best-effort notify (Resend). Never throw out of the webhook because email failed.
}

async function fulfillFromSession(sessionId) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
  if (s.payment_status !== "paid") return;             // guard
  await fulfill(s.metadata, s.amount_total, { sessionId });
}
```

**Idempotency keys for *writes* too:** when creating PaymentIntents/Sessions, optionally pass `{ idempotencyKey }` (e.g. `uid:offer:cartHash`) to `stripe.paymentIntents.create(..., { idempotencyKey })` so a double-submit doesn't create two intents.

> **Sources:** [Checkout fulfillment / idempotency](https://docs.stripe.com/checkout/fulfillment) · existing playbook `web-guides/STRIPE-PAYMENTS-AND-ELEMENTS.md`

---

## 8. Test mode vs live + wallet domain verification

### 8.1 Key/secret swap (no code change)
| Var | Side | Test | Live |
|---|---|---|---|
| `STRIPE_PUBLISHABLE_KEY` / `VITE_STRIPE_PUBLISHABLE_KEY` | client | `pk_test_…` | `pk_live_…` |
| `STRIPE_SECRET_KEY` | server | `sk_test_…` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | server | `whsec_…` (from `stripe listen` **or** a test webhook endpoint) | `whsec_…` (from the **live** endpoint) |

- **Sandbox = isolated test environment**; test keys never touch live money. The connected MCP account is already a sandbox.
- The **`whsec_` from `stripe listen` is different** from the one on a Dashboard-registered endpoint — use the CLI secret for local dev, the Dashboard endpoint secret in prod.
- Object IDs do **not** carry across test↔live; recreate Products/Prices/Payment Links in live mode (or use the Dashboard's copy-to-live).

### 8.2 Apple Pay / Google Pay / Link domain verification
- **Payment methods to register:** Apple Pay, Google Pay, **Link** require **payment method domain registration** to render in Payment Element / Express Checkout Element.
- **Apple Pay** needs domain verification: Stripe hosts the association file for you. Either **Dashboard → Settings → Payment methods → Apple Pay → Add domain**, or programmatically `stripe.paymentMethodDomains.create({ domain_name: "samedaydesk.com" })`. Stripe automatically serves `/.well-known/apple-developer-merchantid-domain-association` for Stripe-hosted surfaces; for a self-hosted Payment Element you host the file Stripe provides at that path.
- **Google Pay / Link** generally register automatically via `automatic_payment_methods` once the domain is added.
- **Test mode:** wallets appear in the Payment Element without full domain verification for *testing* (browser support permitting), but **register the production domain before go-live** so Apple Pay/Link show for real buyers. Register `samedaydesk.com` (and any preview domains) in live mode.
- **Hosted Payment Links / hosted Checkout** need **no** domain registration — wallets work out of the box on `buy.stripe.com` / `checkout.stripe.com`.

> **Sources:** [Payment method domains / registration](https://docs.stripe.com/payments/payment-methods/pmd-registration) · [Apple Pay](https://docs.stripe.com/apple-pay) · [Sandboxes / testing](https://docs.stripe.com/testing)

---

## 9. Test cards (test mode only)

Any **future expiry**, any **3-digit CVC** (4-digit for Amex), any postal code.

| Scenario | Card number | Result |
|---|---|---|
| ✓ Success (Visa) | `4242 4242 4242 4242` | Succeeds immediately, no 3DS |
| ✓ Success (Mastercard) | `5555 5555 5555 4444` | Succeeds |
| ✓ Success (Amex) | `3782 822463 10005` | Succeeds (CVC = 4 digits) |
| ⚠️ 3DS **always** required | `4000 0027 6000 3184` | Forces a 3DS2 challenge on every payment (best for testing the auth modal) |
| ⚠️ 3DS required (must complete) | `4000 0000 0000 3220` | Must complete 3DS2 to succeed |
| ⚠️ 3DS required → declined after auth | `4000 0084 0000 1629` | Passes 3DS then declines (`card_declined`) |
| ✗ Generic decline | `4000 0000 0000 0002` | `card_declined` |
| ✗ Insufficient funds | `4000 0000 0000 9995` | `insufficient_funds` |
| ✗ Lost card | `4000 0000 0000 9987` | `lost_card` decline |
| ✗ Expired card | `4000 0000 0000 0069` | `expired_card` |
| ✗ Incorrect CVC | `4000 0000 0000 0127` | `incorrect_cvc` |
| ✗ Processing error | `4000 0000 0000 0119` | `processing_error` |

For the **3DS modal in test mode**: a mock authentication page appears with **Complete** (success) and **Fail** buttons. Click **Complete** to simulate successful authentication; it redirects to `return_url`. PaymentMethod-token equivalents exist too (`pm_card_visa`, `pm_card_threeDSecure2Required`, `pm_card_chargeDeclined`, …) for server-side test confirmation.

> **Source:** [Stripe testing / test cards](https://docs.stripe.com/testing) · [3D Secure authentication flow](https://docs.stripe.com/payments/3d-secure/authentication-flow)

---

## 10. Stripe CLI — local webhook testing

```bash
# 1. Auth the CLI to your account (opens browser; or use an API key)
stripe login

# 2. Forward live webhook traffic to your local server. PRINTS the whsec_ to use locally.
stripe listen --forward-to localhost:PORT/api/stripe/webhook
#   → "Ready! Your webhook signing secret is 'whsec_...'"  ← put this in STRIPE_WEBHOOK_SECRET for local dev

# (optional) only forward the events you handle:
stripe listen \
  --events payment_intent.succeeded,checkout.session.completed,checkout.session.async_payment_succeeded,payment_intent.payment_failed \
  --forward-to localhost:PORT/api/stripe/webhook

# 3. In another terminal, fire test events at your handler:
stripe trigger payment_intent.succeeded
stripe trigger checkout.session.completed
stripe trigger payment_intent.payment_failed

# 4. (Coding-agent shortcut) Provision a throwaway sandbox with working keys, no signup:
stripe sandbox create --help
```
- `stripe listen` proxies *real* test-mode events (including ones produced by a real test checkout) to localhost, so you can do an actual browser checkout and watch the webhook land.
- `stripe trigger <event>` fires a **synthetic fixture** — great for unit-testing the handler branch, but the fixture's metadata won't contain your `uid`/`offer` (the `fulfill()` guard `if (!uid || !offer) return` handles this gracefully; for a full fulfillment test, drive a *real* test checkout instead).

> **Sources:** [Stripe CLI](https://docs.stripe.com/stripe-cli) · [Test webhooks (`stripe listen`/`trigger`)](https://docs.stripe.com/webhooks/test)

---

## 11. Creating Products/Prices/Payment Links via API or Stripe MCP

Three equivalent paths — pick per situation:

1. **Stripe MCP (fastest for an agent, already authenticated to the sandbox):**
   - `stripe_api_write` → create `products`, `prices`, `payment_links`, issue `refunds`.
   - `stripe_api_read` / `search_stripe_resources` / `fetch_stripe_resources` → verify objects landed.
   - `get_stripe_account_info` → confirm you're on `Neomorphic LLC sandbox` (`acct_1SAPeUPwY9LS48U1`).
   - `stripe_implementation_planner` → scaffold an integration plan.
   - `create_refund` → money-back guarantee.
2. **Node script** (`stripe.products.create` / `.prices.create` / `.paymentLinks.create`) — see §3/§5. Best when the catalog should be reproducible/version-controlled.
3. **Dashboard** (manual) — fine for one-off setup, but prefer API/MCP for repeatability.

**Recommended for this build:** use the **MCP to seed the 5 offers + per-offer Payment Links in the sandbox now** (for testing), then commit the equivalent Node seed script so live-mode setup is one command.

---

## 12. How an automated browser agent completes a test checkout

The agent has Chrome control (`mcp__Claude_in_Chrome__*` / chrome-devtools MCP) + computer control. Two checkout surfaces to exercise:

### A) On-site Payment Element (your SPA)
1. `navigate` to the local/staging checkout URL for an offer (e.g. `http://localhost:PORT/checkout?offer=resume_linkedin`). Sign in / verify email first if gated.
2. Wait for the Payment Element **iframe** to mount. The card fields are inside a cross-origin iframe — prefer the **chrome-devtools MCP** `fill`/`type_text` with the iframe's frame context, or computer-use as a fallback. Stripe test inputs:
   - Card number: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12 / 34`)
   - CVC: `123`
   - ZIP: `42424`
3. Click **Pay**. With `redirect: "if_required"` and a `4242…` card, no redirect occurs and the page advances to the success/return state.
4. **3DS path:** use `4000 0027 6000 3184` → a Stripe **mock 3DS modal** appears in an iframe → click **Complete** to authenticate.
5. **Decline path:** use `4000 0000 0000 0002` → assert the inline error message renders and no order is created.
6. Verify the return page calls `/api/checkout/verify-payment-intent` (watch `read_network_requests`) and shows "paid".

### B) Payment Link (hosted)
1. `navigate` to the `link.url` (`https://buy.stripe.com/…` in test mode shows a "TEST MODE" banner).
2. Fill email + card `4242 4242 4242 4242`, exp `12/34`, CVC `123`. The hosted page is same-origin Stripe UI, so DOM-driven fill is straightforward.
3. Click **Pay** → redirected to `after_completion` URL with `?cs=cs_test_…`.
4. Assert `checkout.session.completed` arrived (watch the `stripe listen` terminal or query the session via MCP) and that fulfillment marked the order paid.

**Agent tips:**
- The "TEST MODE" banner / orange styling confirms you're not on live money.
- Use `read_network_requests` to assert the `create-payment-intent` and `verify` calls succeeded (200) and to read back the `paymentIntentId`.
- For Stripe iframes, chrome-devtools MCP handles frame targeting better than pixel-clicking; fall back to computer-use only if the iframe blocks programmatic input.
- After each run, verify in the Dashboard (`https://dashboard.stripe.com/test/payments`) or via MCP `search_stripe_resources` that a **succeeded** PaymentIntent / paid Session exists with the right `metadata.offer` and amount.

---

## 13. ORDERED TEST CHECKLIST (agent-executable)

> Assumes the single Node process (Express `/api/*` + built Vite SPA) is running locally on `PORT`, and the Stripe MCP is connected to `Neomorphic LLC sandbox`.

**Phase 0 — Setup**
1. `stripe login` (or rely on the MCP being authenticated). Confirm account via MCP `get_stripe_account_info` → expect `acct_1SAPeUPwY9LS48U1`.
2. Put `sk_test_…` in `STRIPE_SECRET_KEY`, `pk_test_…` in `VITE_STRIPE_PUBLISHABLE_KEY`. Set server `apiVersion: "2026-05-27.dahlia"`.
3. Seed catalog: via MCP `stripe_api_write` (or the Node seed script) create the 4 fixed Products+Prices (§3) and 1 Payment Link each. Record the `price_*` and `plink_*` IDs.
4. Start `stripe listen --forward-to localhost:PORT/api/stripe/webhook`. Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`; restart server.

**Phase 1 — Webhook plumbing**
5. `stripe trigger payment_intent.succeeded` → assert server logs the event, signature verifies, returns `2xx`. (Synthetic fixture → `fulfill()` no-ops on missing `uid`; that's expected.)
6. `stripe trigger checkout.session.completed` → same assertion.
7. Tamper test: send a request to the webhook with a bad `Stripe-Signature` → assert **HTTP 400** and no fulfillment.

**Phase 2 — On-site Payment Element (Flow A), happy path**
8. Browser agent: sign in (verified email), open `/checkout?offer=resume_linkedin`.
9. Assert `POST /api/checkout/create-payment-intent` returns 200 with `clientSecret`, `amount === 5900`. Confirm via MCP the PaymentIntent has `metadata.offer === "resume_linkedin"` and `amount === 5900`.
10. Fill Payment Element with `4242 4242 4242 4242`, `12/34`, `123`, ZIP `42424`. Click **Pay**.
11. Assert no redirect (stayed on page), success state shows, `POST /api/checkout/verify-payment-intent` returns `{verified:true}`.
12. Assert the `stripe listen` terminal shows `payment_intent.succeeded` forwarded and handled. Confirm Firestore `orders/order_<uid>_resume_linkedin` exists exactly once with `status: received`, `amount: 5900`.

**Phase 3 — 3DS + declines (Flow A)**
13. Repeat checkout with `4000 0027 6000 3184` → 3DS mock modal appears → click **Complete** → payment succeeds, order created.
14. Repeat with `4000 0000 0000 0002` → inline `card_declined` error; assert **no** new order, user not marked paid.
15. Repeat with `4000 0000 0000 9995` → `insufficient_funds`; assert clean failure UX.

**Phase 4 — Idempotency**
16. Re-fire fulfillment for the Phase 2 success (e.g. re-`POST` verify with the same `paymentIntentId`, and let the webhook re-deliver) → assert the order is **not** duplicated (still one `order_<uid>_resume_linkedin`), user stays paid.

**Phase 5 — Payment Link (Flow B)**
17. Open the `resume_linkedin` Payment Link URL in the browser; confirm "TEST MODE" banner.
18. Pay with `4242 4242 4242 4242`, `12/34`, `123` → redirected to `after_completion` URL with `?cs=cs_test_…`.
19. Assert `checkout.session.completed` forwarded; `payment_status === "paid"`; order fulfilled idempotently (deterministic id again).

**Phase 6 — Instant payment link (operator flow)**
20. Via MCP/endpoint, create an ad-hoc Payment Link with inline `price_data` (`unit_amount: 12500`, `metadata.offer: custom_quote`). Get `link.url`.
21. Browser agent pays it with `4242…` → assert `checkout.session.completed` with `amount_total === 12500` and `metadata.offer === "custom_quote"`; fulfillment records a `custom_quote` order.

**Phase 7 — Refund (money-back guarantee)**
22. Issue a refund via MCP `create_refund` (or `stripe.refunds.create({ payment_intent })`) for a succeeded PI → assert `charge.refunded` (if subscribed) and that any refund-handling marks the order refunded.

**Phase 8 — Verify in Dashboard / MCP**
23. `https://dashboard.stripe.com/test/payments` (or MCP `search_stripe_resources`) shows the succeeded PaymentIntents/paid Sessions with correct amounts + `metadata.offer`. No live-mode objects created.

**Phase 9 — Go-live readiness (do NOT run charges here)**
24. Swap `pk_test/sk_test/whsec_` → live equivalents in prod env (Hostinger). No code change.
25. Register a **live** webhook endpoint at `https://samedaydesk.com/api/stripe/webhook` with `payment_intent.succeeded`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`; copy its live `whsec_`.
26. Register `samedaydesk.com` for **Apple Pay / Link** domain verification in **live** mode (`stripe.paymentMethodDomains.create` or Dashboard). Re-seed live-mode Products/Prices/Payment Links.

---

## 14. Gotchas / pitfalls (consolidated)

- **Never trust a client amount.** Client sends an **offer slug**; server looks up the price. Stamp `{uid, offer, amount}` into `metadata` and re-validate on fulfillment.
- **Raw body must precede `express.json()`** for the webhook route, or `constructEvent` throws "No signatures found matching the expected signature."
- **CLI `whsec_` ≠ Dashboard `whsec_`.** Use the CLI's for local dev; the Dashboard endpoint's for prod. Don't cross them.
- **`stripe trigger` fixtures lack your metadata** → won't drive a full fulfillment. Drive a real test checkout for end-to-end coverage; use `trigger` only to prove the handler branch + signature path.
- **Webhook events render in the endpoint's API version.** Keep the endpoint's version aligned with your SDK pin (`2026-05-27.dahlia`) or read fields defensively.
- **Payment Link metadata vs PI metadata:** set both `metadata` (link/session) and `payment_intent_data.metadata` so whichever event you fulfill on carries the data.
- **Wallets need domain registration in live mode** (Apple Pay/Link). Hosted Payment Links/Checkout don't.
- **Idempotency is non-negotiable:** webhook + verify-on-return + Stripe retries all hit `fulfill()`; deterministic doc id + transaction makes it exactly-once.
- **3DS redirects don't occur for Dashboard-created payments** — test 3DS through your own front-end or the Checkout Sessions API, not the Dashboard "create payment" tool.
- **Return 2xx fast;** do email/notify best-effort and never throw out of the webhook because a side effect failed (Stripe will retry and you'll double-process).

---

## 15. Sources

- Stripe SDK versioning & support — https://docs.stripe.com/sdks/versioning?lang=node
- stripe-node CHANGELOG (v22.2.2, pin `2026-05-27.dahlia`) — https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md
- stripe on npm — https://www.npmjs.com/package/stripe
- Stripe Web Elements / compatible APIs — https://docs.stripe.com/payments/elements
- Build an advanced integration (PaymentIntent + Payment Element) — https://docs.stripe.com/payments/quickstart
- Checkout Sessions quickstart — https://docs.stripe.com/payments/quickstart-checkout-sessions
- `stripe.confirmPayment` reference (`redirect: if_required`) — https://docs.stripe.com/js/payment_intents/confirm_payment
- Verifying PaymentIntent status — https://docs.stripe.com/payments/payment-intents/verifying-status
- Payment Links API — https://docs.stripe.com/payment-links/api
- Checkout fulfillment (events, idempotency, line items) — https://docs.stripe.com/checkout/fulfillment
- Webhooks — https://docs.stripe.com/webhooks
- Webhook signature verification — https://docs.stripe.com/webhooks/signature
- Test webhooks (Stripe CLI `listen`/`trigger`) — https://docs.stripe.com/webhooks/test
- Stripe CLI — https://docs.stripe.com/stripe-cli
- Testing / test cards — https://docs.stripe.com/testing
- 3D Secure authentication flow / test cards — https://docs.stripe.com/payments/3d-secure/authentication-flow
- Payment method domains / registration (Apple Pay, Google Pay, Link) — https://docs.stripe.com/payments/payment-methods/pmd-registration
- Apple Pay — https://docs.stripe.com/apple-pay
- Connected sandbox: `Neomorphic LLC sandbox` `acct_1SAPeUPwY9LS48U1` — https://dashboard.stripe.com/acct_1SAPeUPwY9LS48U1/apikeys
