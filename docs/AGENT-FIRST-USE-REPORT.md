# Agent first-use report

Plan 26 Q at Pilot `4ece385b1a1076aad825b1e86d0cbed21e21ef81` sets the price at 49 USD. The report covers a real outside-agent cold use of the customer's public tool or MCP server and task. Delivery includes a recording, what happened and a short report. Submit and link a fix PR when the run finds a genuine defect and the repair is warranted. A submission cannot predict maintainer acceptance.

## Off by default

Leave `SDS_AGENT_FIRST_USE_REPORT` unset. The offer row in `release/offers.json` is switched off and has no checkout link. `GET /api/checkout/offers/agent_first_use_report` reports `unavailable` and an empty methods array. The USD 490.00 seller repair and its separate report order, all legacy offers, and previously frozen account purchases retain their terms. This offer uses verified-account card checkout. Hosted and USDC routes do not admit it. Disabling creates does not discard a previously bound paid attempt.

## Contract for the page owner

After the approved page and actual sample, the intended action is `/checkout?offer=agent_first_use_report`. The current client stays unchanged. The activation client adds the offer to `client/src/lib/services.ts`, collects the intake before card setup in `client/src/pages/Checkout.tsx`, and can link the delivery read from `client/src/pages/Dashboard.tsx`. The existing verified-account handoff validates against that offer list.

Send `{offer:"agent_first_use_report", intake:{targetUrl, details}}` to `POST /api/checkout/create-payment-intent` using the existing verified account. Target is an HTTPS public tool URL without credentials, IP literal, custom port, query or fragment. Task details are nonempty text up to 4,000 bytes. Attachments are outside this offer. This is a URL syntax check. Confirm public network reachability and safe execution separately in the operator's isolated, uncredentialed delivery environment. Checkout never fetches or executes the target.

The create freezes intake in the existing attempt before returning the PaymentIntent. Keep the returned `paymentAttemptId` and `intakeSnapshot`. A resumed create uses `payment_attempt_id` and the exact original intake. `POST /api/checkout/prepare-payment` accepts only the same intake for the bound attempt. Confirm through the existing Payment Element. The existing signed Stripe webhook and authenticated `POST /api/checkout/verify` converge on the same account order. Payment settles only against the stored owner, exact PaymentIntent, USD 49.00 actually received, mode and offer. Missing or altered stored intake stays `intake_required` for reconciliation. A received order is not a delivered report.

## Work and delivery

The existing `public.orders` table is both buyer history and the paid queue. Q selects `received` rows. No new queue or migration. The staff command uses the existing service-role owner in a restricted environment. Its queue results are private.

```sh
node --env-file="$OWNER_ENV" server/scripts/agent-first-use-report.mjs queue --output "$PRIVATE_QUEUE_JSON"
node --env-file="$OWNER_ENV" server/scripts/agent-first-use-report.mjs deliver --order "$ORDER_ID" --report "$PRIVATE_REPORT_PDF" --links "$PRIVATE_LINKS_JSON"
```

The protected links file has `recordingUrl` and `recordingAccessConfirmed:true`. Use a recording with the actual buyer's access verified through the existing private viewer. The optional `fixPrUrl` points to the actual GitHub PR. Omit it if no PR was called for. The application never creates a recording, a PR or a placeholder report. Staff prepares and verifies these before invoking delivery.

The PDF stays in the existing private `intake-uploads` bucket, under an operator-only prefix outside buyer-writable folders. The same PDF and references recover idempotently. Once delivered, different pointers or bytes require operator reconciliation. `GET /api/checkout/orders/:id/delivery` requires the same verified account and returns status, and only when delivered a five-minute signed `reportUrl`, its SHA-256, the private recording reference and the optional PR. It returns 404 for another account. Keep delivery URLs out of analytics and logs.

## Reuse and activation evidence

Reuse the installed MIT Stripe Node 22.2.2 client, existing raw-body signature verifier and owned attempts. The upstream reference is Stripe's raw Express example at `dd924299e2517e2b4e3b571aa7f20f295289ea71`. Stripe's Checkout sample at `c834ba3ae155bd77a6aeb5879b58edd6a944af00` is reference-only here. It does not freeze task intake against the existing Payment Element. The controller's accepted Pilot workflow and existing queue, storage and receipt paths keep the payment and delivery authority in the owning app.

Before activation, receive approved page and real sample, the exact signed-event delivery from the existing restricted Stripe test sandbox and isolated verified QA account, the stored Q order, one real private delivery readback, and the off-owner refusal. Use the existing `STRIPE_TEST_KEY_FILE`, the account preview's `SDS_ACCOUNT_PREVIEW_DIR`, and existing test loader values `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SDS_PRIVATE_PREVIEW=1`, and the preview's verified-account auth and storage profile. Only that private preview should set `SDS_AGENT_FIRST_USE_REPORT=1` during qualification. Fixtures do not replace the sandbox or the buyer's access check.
