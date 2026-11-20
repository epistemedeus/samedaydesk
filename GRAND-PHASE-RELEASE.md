# SameDayDesk grand phase release

Prepare privately. Do not merge, use Stripe live mode, deploy or change account settings before release authorization. This runbook is not a release receipt.

## Before the merge

1. Copy the current main SHA, exact approved PR head, existing Hostinger deployment ID and prior configuration references into the release receipt. Confirm the PR includes current main and all preview checks and rollback rehearsal are green.
2. Receive the known Railway x402 merchant settlement projection and its current payer exclusions through the authenticated read-only route. Match transaction references to declared tool routes, not request counts or guessed attribution. Keep the private policy projection mode 0600 outside Git.
3. Confirm the release database has migration `supabase/migrations/0008_task_requests.sql` and any forward migration introduced by the final checkout implementation. Check existing task/order compatibility before enabling the new checkout endpoints. Record migration receipts, not connection strings.
4. Put the exact production Stripe and SameDayDesk Resend settings in the current host only after release approval. Register only the required signed webhook types and match the enrolled provider IDs to the approved offers. `ADMIN_EMAIL` is a restricted existing mailbox routing value. Do not send preview mail to a real customer.

## Receipts refresh

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
