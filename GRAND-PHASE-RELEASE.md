# SameDayDesk grand phase release

Prepare privately. Do not merge, use Stripe live mode, deploy or change account settings before release authorization. This runbook is not a release receipt.

## Before the merge

1. Copy the current main SHA, exact approved PR head, existing Hostinger deployment ID and prior configuration references into the release receipt. Confirm the PR includes current main and all preview checks and rollback rehearsal are green.
2. Receive the known Railway x402 merchant settlement projection and its current payer exclusions through the authenticated read-only route. Match transaction references to declared tool routes, not request counts or guessed attribution. Keep the private policy projection mode 0600 outside Git.
3. Confirm the release database has migration `supabase/migrations/0008_task_requests.sql` and any forward migration introduced by the final checkout implementation. Check existing task/order compatibility before enabling the new checkout endpoints. Record migration receipts, not connection strings.
4. Put the exact production Stripe and SameDayDesk Resend settings in the current host only after release approval. Register only the required signed webhook types and match the enrolled provider IDs to the approved offers. `ADMIN_EMAIL` is a restricted existing mailbox routing value. Do not send preview mail to a real customer.

## Paid intake and monthly release checks

Keep these switches off in production until release. Apply `0009_care_orders.sql` with the database migration owner. The app and scheduled worker use a restricted same-project PostgreSQL login with read/write access only for the four care tables; no anonymous or account-client access. Use the connection string without SSL options and put the verified PostgreSQL CA in `SDS_CARE_DATABASE_CA_BASE64`. Confirm 0008 and its existing task records independently.

Enable `SDS_CARE_CHECKOUT=1`, `SDS_CARE_DATABASE_URL`, `SDS_CARE_ACCESS_SECRET` (independent, at least 32 bytes), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `SDS_CARE_PORTAL_CONFIGURATION`. Keep the canonical origin `https://samedaydesk.com`. Use a Stripe portal configuration that cancels at the end of the paid period; verify the exact subscription selected by the receipt link. On the signed webhook listener, receive `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` and `radar.early_fraud_warning.created` in addition to the existing offer events. Bind the endpoint's event shape to the care client's pinned API version and check old handlers before switching it. Keep previous payment links and old fulfillment working. Do not rely on a redirect, on checkout session creation, or on card details as proof of a paid month.

On the existing scheduler, run `node server/scripts/drain-care-mail.mjs` every two minutes. Verify `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_REPLY_TO` send and reply from SameDayDesk only. Examine deferred rows and any unaccepted send older than 23 hours rather than replaying blindly. Never paste receipt capabilities in logs or operator notes.

For Sentinel, confirm the first release check, agreed scope and real paid order before enrolling it. Set `SDS_CARE_SENTINEL_WORKER=1`, `SDS_CARE_SENTINEL_ORDER` for that order, `SDS_CARE_SENTINEL_PACKAGE` for the approved exact version (preview: `sentinel-ir-mcp@0.5.13`), and a single-repository `SDS_CARE_GITHUB_ACTIONS_TOKEN` with Actions read/write. Run `node server/scripts/tick-care-sentinel.mjs` every five minutes from the same release checkout. It claims at most one active, scoped period, not a checkout or an unpaid invoice. It sends only the package version and a random run reference to Actions, never the order or the buyer's scope. The matrix runs on Windows, macOS and Linux. A lost dispatch response is reconciled by the exact run title and branch, not by dispatching again. If the scheduler returns `dispatch_needs_review` or `run_mismatch`, check the stored lease, dispatch time and Actions receipt before authorizing another run. A conclusively accepted report is retained with the paid period. For an agreed release check between periods, use the same matrix with the newly verified exact public package version and record its report in the existing order service record. Do not run a package named in buyer-provided intake or attach a private repository to Actions.

On rollback stop the newly introduced jobs first. Keep the tables, amount and old obligations, including paid months whose review or mail is pending. Reconcile signed events received during the rollback window before reopening. There is no table-drop or database reset in the rollback.

In the private combined check, the release branch's Sentinel workflow starts the built Node app and a disposable PostgreSQL database, signs synthetic test-mode Checkout and invoice events, and uses a temporary GitHub Actions workflow token to dispatch the actual three-system matrix. No test mail leaves the outbox. The normal worker does not accept a completed run until all three reports are present for that run ID, source revision and attempt. Missing or expired report artifacts leave the paid month open for review. For release, check the live worker's exact dispatch receipt and three report files before relying on the scheduler. The private fixture establishes the Actions and report path, not a provider-hosted payment or real mail receipt.

## Fixed quotes and the 490 USD report

Apply `0010_task_quotes.sql` after 0008/0009. Use the same project and existing `public.task_requests`, not an empty replacement database. Before turning the new routes on, the scoped application login needs SELECT and INSERT on `task_requests` and `task_quotes`, UPDATE on task-request status and quote receipt columns, and the previously listed care-table grants. Use an explicit role policy for these two RLS tables and confirm as that login that both an old task and a newly persisted request can be read. Verify unauthenticated app callers cannot list either table. Connection strings and customer information go only in the host environment and restricted workspace.

Prepare a quote only after the expected scope, acceptance check and amount are known. Write `{"amountCents":12300,"scope":"...","acceptance":"..."}` to a mode-0600 file. Run `node server/scripts/issue-task-quote.mjs <task-uuid> <terms-file> <new-private-receipt-file>`. The command does not send anything. It verifies the immutable price and gives you the one-use link and exact scope for the existing recipient. Reissue with the same terms only; reconcile an ambiguous Stripe response instead of creating a new quote. The signed webhook updates the existing task projection only once. An email mismatch or refund sets `needs_review`; always check that before delivery. Do not infer collected revenue from an opened link.

The SameDayDesk 490 USD report button redirects to the existing Stripe link containing the public-target field. The preview rejects that live URL; set `SDS_TEST_SELLER_CONFORMANCE_LINK` to its test counterpart. At release verify the exact configured payment-link ID, USD amount, target field, and canonical source finding when present. The link buys the report, not realization of every suggested repair.

## Receipts refresh

The build also writes anonymous first-render documents under
`client/dist/route-shells/.public-first-render`. Keep that generated directory in
the same deployment as its assets. The server selects only known public paths;
account, receipt capability and arbitrary query views keep their normal shell.
After the merge, receive the first-render marker on `/`, `/for-agents` and `/x402`,
then verify heading continuity, both theme controls, receipt keyboard scrolling
and mobile Lighthouse. Do not count an empty-shell fallback as the new build.
The roll must remain still outside the viewport and resume when visible.
Retain the generated pages and runtime together in the slice revert below.

Enable the existing application's private `SDS_RECEIPTS_SNAPSHOT_PATH`, an absolute persistent path outside the webroot. The path's parent must be writable by the scheduled writer and readable by the web process. Use the scheduled runner already available on the current hosting account. Confirm `BASE_RPC` serves finalized Base data and old log ranges before starting. Set `RECEIPTS_PRIVATE_EXPORT` to the most recent qualified restricted route and payer projection. Old proof files and the bundled snapshot stay as a fallback.

The single writer executes from the verified release checkout:

```sh
flock -n "$SDS_RECEIPTS_SNAPSHOT_PATH.lock" node scripts/build-receipts.mjs
```

Use once daily to start. Log exit, block and safe counts. Never log endpoint credentials or copy the payer policy to the public feed. The writer refuses missing policy, wrong chain, incomplete history, stale blocks, a tape below the floor, or invalid results. It atomically replaces the file. The existing app reads it at `/receipts.json` and provides new receipt pages without an application build or restart. Keep the last good snapshot on a provider refusal. This mainnet read happens only at authorized release, never in the private preview.

Preview reproduction uses no chain call: run the production build and start the app with a temporary `SDS_RECEIPTS_SNAPSHOT_PATH`, then run `node scripts/check-receipts-refresh.mjs http://127.0.0.1:31861 "$SDS_RECEIPTS_SNAPSHOT_PATH"`. It qualifies a synthetic update, confirms a new shell on the same running server, refuses a stale write and serves the previous data after an invalid input. The temp snapshot may never be pointed at production.

## Release check and revert

After approval, merge the exact green PR with a merge commit. Confirm the deployed SHA within 10 minutes. Open the homepage and changed pages on phone and desktop in both themes, inspect errors and failed requests, run mobile Lighthouse and test checkout up to Stripe, the intake, auth, the machine files and cold HTTP, CLI and MCP entry. Run the receipts job once against production and compare the feed, homepage tape and new receipt page. Keep the 500-session start-rate tripwire and watch errors, checkout and forms for one day.

If any live check fails, record the failure and prepare an exact revert from current main:

```sh
git fetch origin main
git switch -c release/revert-samedaydesk-grand-phase origin/main
git revert -m 1 "$SDS_RELEASE_MERGE"
git push origin HEAD:refs/heads/release/revert-samedaydesk-grand-phase
```

The release operator lands the revert. Confirm the previous Hostinger path and keep earned obligations, existing records and the already-qualified receipt data intact. Stop a release scheduler introduced by this slice rather than dropping data. The exact scratch merge, revert and rebuild evidence must be added before release.
