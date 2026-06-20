# Build reference — reusable integration playbooks

Distilled from a production build (Express API + SPA on Hostinger). These are
**general structure + know-how**, not project-specific — send any subset to the
agent to one-shot a new site's integration.

## Files
- **[FIREBASE-AUTH-AND-DB.md](FIREBASE-AUTH-AND-DB.md)** — accounts + database. Client vs Admin SDK, ID-token bearer auth, default-deny Firestore/Storage rules, server-only privileged writes.
- **[RESEND-EMAIL-SIGNUP-VERIFICATION.md](RESEND-EMAIL-SIGNUP-VERIFICATION.md)** — transactional email + a hashed, rate-limited 6-digit email-verification code, plus admin notifications.
- **[STRIPE-PAYMENTS-AND-ELEMENTS.md](STRIPE-PAYMENTS-AND-ELEMENTS.md)** — Payment Element (embedded) and hosted Checkout, server-authoritative pricing, webhook + verify-on-return, idempotent fulfillment.
- **[DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)** — GitHub→Hostinger auto-deploy for both static sites and Node apps, with an agent runbook for Chrome control.

## The shared architecture they assume
- **One repo, one Node process** in production: Express serves the API at `/api/*`
  and the built SPA otherwise. (A pure marketing site skips the server — see the
  static path in the deploy doc.)
- **Firebase is the identity + data spine.** Browser holds the session and mints
  an **ID token**; the **server verifies it** and is the only thing trusted to
  write anything that grants value or status.
- **Secrets on the server, public config baked into the SPA.** Service-account
  JSON, `sk_…`, `whsec_…`, Resend key → server env. Web Firebase config +
  `pk_…` → build-time public env.
- **Three gates, all server-side:** `requireAuth` (valid ID token) →
  `requireVerifiedEmail` (Resend code confirmed) → payment (`paymentStatus:"paid"`,
  set only by the server from a Stripe webhook/verify). The UI mirrors these but
  never enforces them alone.
- **Trust nothing from the client** for money or authorization: prices computed
  server-side and stamped into Stripe metadata; fulfillment is idempotent.

## Typical end-to-end flow
signup (Firebase) → email code (Resend) → verified → intake/cart →
PaymentIntent (server) → Payment Element (client) → webhook + verify (server) →
`paid` + order created (Admin SDK, idempotent) → dashboard.

## Env var surface (superset)
`NODE_ENV`, `PUBLIC_URL`, `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_UID`;
`FIREBASE_*` (client web config) + `FIREBASE_SERVICE_ACCOUNT_KEY` + `FIREBASE_STORAGE_BUCKET` + `FIREBASE_FIRESTORE_DATABASE_ID`;
`STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`;
`RESEND_API_KEY` / `RESEND_FROM_EMAIL`.
Server gets all; the bundler bakes only the public client ones into the SPA.
