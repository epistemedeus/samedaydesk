# Private late discharge

The existing Hosted Wallet Market owner import binds an observed discharge to one late acceptance. The archival opportunity row stays owed with its kernel unpaid and transfer null. The private debt read reports `observed_discharge`, `nativePaidObservation: true`, and `newPayable: false`. Existing timely and retained consumers continue using the verdict contract. The late import runs no settlement or capital transition.

The new path is disabled unless `HOSTED_WALLET_MARKET_LATE_DISCHARGE=1` is explicitly set. The owner bearer authorizes the import. On the first request, the original requester session independently authenticates the exact persisted Neo receipt through the installed private reader. The session is absent from the request hash, receipt and database. The request may select an existing proof but cannot supply a receipt, registry path, witness, assignment key, or a paid flag as authority. The configured registry, held reserve, child claim, sealed attempt, exclusive transfer/log and finalized chain observation are checked by the receiver.

The owner operation key is `late-discharge-` followed by the prepared receipt ID. Exact retry after commit reads the original response in the existing owner transaction. A new key cannot create a second disposition. An unavailable verification leaves the debt on hold. The same database transaction stores both the immutable disposition and its exact owner operation response.

## Private commands

The inputs are the original private Pilot intent, its exact signer-free canonical readback, and the original requester's authenticated session file. The existing owner configuration supplies the tenant and bearer. Keep all inputs and results private.

```sh
node vendor/hosted-wallet-market/bin/installed-debt.mjs prepare-late \
  --input "$CANONICAL" --intent "$INTENT" --output "$IMPORT"
node vendor/hosted-wallet-market/bin/installed-debt.mjs import \
  --input "$IMPORT" --requester "$REQUESTER"
node vendor/hosted-wallet-market/bin/installed-debt.mjs disposition --obligation "$OBLIGATION"
```

## Source and cutover

The managed SameDayDesk vendor source owns this overlay. The package still records the historical Pilot succession and reward exports in `SOURCE.json`. The existing SameDayDesk refresh validates the declared late members before refreshing the package and host pin. The older Pilot succession exporter refuses these newer consumer preimages before copying. Refresh the interpreted package with `node server/scripts/refresh-installed-receiving-source.mjs`. The separately compiled Neo artifact still uses its own exporter.

1. Review the exact managed consumer source, its package manifest and host pin, and the exact compiled Neo candidate identified by `lateDischargeSource`. Qualify the original requester and the private owner bearer under the actual installed identity. The existing enrollment and source succession must cover the qualified consumer and preserve prior observations.
2. Confirm the one controller registry, original issuance and reserve, Pilot's exact late hold, settlement child claim, sealed attempt and transfer allocation. Verify independently clear prior effects and retire competing old senders, release/reuse paths outside the controller, and manual writers. Verify the finalized chain and exact destination against the original evidence.
3. In the enrolled owner database, apply the explicit `installed-debt.mjs migrate-late` migration before enabling writes. Inspect old disposition preimages, the preserved match trigger, the new late match trigger and debt accounting. Confirm the normal legacy routes, exact lost-response replay, and receipt-only behavior against the qualified installation.
4. Enable the flag only after those checks. To roll back, unset the flag on this reader and retain the additive schema, owner operations, original archival rows, registry and observed dispositions. Older reader binaries cannot project a late disposition. Keep late imports closed and retain the same canonical evidence while reconciling any uncertain result.
