# Cold unfunded requester receipt

The installed market already posts unfunded work when a source-qualified capability is loaded. A switch, a raw JSON blob, or a developer absolute path is not that capability. Root generates the document on the installed tree and selects one binding:

- `var/machine-capability.json`, a mode `0600` file inside the installation, or
- the `sourceBound` value printed by the same command, which is `source-bound:` plus the canonical document.

```sh
node vendor/hosted-wallet-market/bin/machine-profile.mjs \
  --sds-root "$SDS_ROOT" \
  --origin "$ORIGIN" \
  --tenant "$TENANT" \
  --money unfunded \
  --out var/machine-capability.json
```

Add only `HOSTED_WALLET_MARKET_MACHINE_PROFILE` to the existing wallet extension. Payments, public reads, funded tasks, and human assets stay off. No signer and no money-authority module are added.

```sh
node vendor/hosted-wallet-market/bin/installed-debt.mjs prepare-release \
  --manifest "$MANIFEST" --input "$EXISTING" --wallet "$WALLET" \
  --sds-root "$SDS_ROOT" --output "$OUT"
```

`prepare-release` refuses a switch and refuses a `source-bound:` document unless `--sds-root` recomputes the installed source hash and the host-closure hash. An absolute path without `--sds-root` stays the previous unread same-host form. The packet receipt stays `sent: false` and `qualified: false`.

Rollback is the packet's `rollback.json`, or unsetting `HOSTED_WALLET_MARKET_MACHINE_PROFILE` when that key was the only addition, then restarting the process. Do not drop, delete, or truncate accounts, obligations, or market rows. With the key unset, machine discovery falls through and the existing journey response remains.

Operator counts, with QA ids supplied only in a mode `0600` exclusion file:

```sh
node vendor/hosted-wallet-market/bin/installed-debt.mjs funnel --exclude "$EXCLUDE"
```

Cohort stays `unknown`. Discovery rows are listing events. `paidWork` follows funding rows and stays false while the capability money is `unfunded`. The 5% fee policy is unchanged.

`SOURCE.json` still names the installed `3009b83c` hash `9b2a778e1847482819b02205c376010d9c31e85f1bb555826106e4c9f8da8f05`. Its host closure is `7bdfb762a15d74af9171c4dd0f21007b301f331efa6bc45bf073ddd893888b4a`. This candidate's installed source hash is `8bdc912c273de9fcf47ed9df56b7fecb481ba30ef46086b48ce5e1ac4751899d` and its host closure is `5f947f65df00af44bbdb2bd6d4ddcee20cdba5bd6bccacde194f1e5894691559`. Root enrolls those candidate hashes at activation. The agent commands are `examples/cold-requester.mjs` and `examples/GUIDE.md`.
