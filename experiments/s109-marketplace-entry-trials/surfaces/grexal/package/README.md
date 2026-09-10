# Grexal source-change evidence packager (S109)

Narrow agent: package a **git diff + acceptance report**. **No paid model calls.** Dry `grexal.json` (`manifest_version` 3) + offline fee worksheet.

**No publish, no deploy, no login, no spend.**

Marketplace name / description / category / tags / pricing / visibility are **not** in `grexal.json`. They live on the platform agent record (`grexal agent set-*` / `grexal agent price`) after a first `push`. This worker does not push.

## Preferred dry-run (vendored, offline)

From repository root:

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/validate-manifest.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs --table
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs 0.10
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.js \
  --repoPath . --baseRef HEAD --headRef HEAD \
  --outDir /tmp/s109-grexal-dry-out
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/grexal/package test
```

Packager also accepts a precomputed diff (no git):

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.js \
  --unifiedDiffFile /tmp/example.diff \
  --acceptanceNotes "tests green" \
  --stdout-only
```

Fee formula (docs, not a live quote):

```
platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)
```

Worksheet: [`worksheets/price-estimate.md`](./worksheets/price-estimate.md). Primary citation: https://docs.grexal.ai/docs/payments

## Optional: `npx grexal --help` (only if npm is free/local)

`grexal@0.4.1` `--help` does not call `requireAuth()`. It still **downloads the CLI from the npm registry** unless the tarball is already local. Prefer the vendored validator above.

If the registry is reachable and $0:

```bash
npx --yes grexal@0.4.1 --help
```

This cell did **not** run `npx`. It ran `--help` and `validate` from the G1-unpacked `grexal-0.4.1.tgz` after a $0 `/tmp` install of CLI runtime deps (`commander`, `chokidar`, `tsx`, `@grexal/sdk@0.0.2`). Result: help listed unauthenticated `validate`/`init`/`dev`; `validate` printed `Manifest valid ✓` on this tree; `--version` still prints `0.1.0` (stale vs package 0.4.1). No `~/.grexal/credentials.json` was created.

Do **not** run from this worker:

```bash
npx grexal login
npx grexal init          # would write a *new* project; this tree is already vendored
npx grexal push
npx grexal publish
npx grexal deploy        # alias of push --publish
npx grexal agent set-*
npx grexal agent price add …
npx grexal runs invoke …
```

`grexal validate` is unauthenticated but needs the CLI plus `commander`/`tsx`/`@grexal/sdk` installed. This package does **not** add those dependencies. Use `bin/validate-manifest.mjs` (rules aligned with the unpacked 0.4.1 `validateManifest`).

## Layout

| Path | Role |
| ---- | ---- |
| `grexal.json` | Runtime contract (`entrypoint`, `runtime`, typed `input_schema` / `output_schema`) |
| `.grexal/agent.json` | Local identity stub `{ "name": "samedaydesk-source-change-evidence" }` — becomes `{ "agentId": "ag_..." }` only after first push |
| `agent/pack_evidence.js` | Entrypoint (`.js` is valid for `runtime.language=typescript` in 0.4.1) |
| `bin/validate-manifest.mjs` | Offline manifest check |
| `bin/fee-worksheet.mjs` | Offline clamp worksheet |
| `worksheets/price-estimate.md` | Human-readable fee table + zero-LLM backsolve |

## Offer framing

- **Paid delta** (if Root later publishes): per-run packaging of a git range into a machine-readable acceptance report, billed on Grexal.
- **Free alternative:** local `git diff` + notes. Public gateway recipes remain free upstream (`epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666`).
- **Attribution:** SameDayDesk sells packaging/acceptance, not proprietary ownership of public recipes. Grexal’s 20% fee is a runtime take rate, not a license on those recipes.

Unknown buyer demand is an experiment, not a Stage-1 blocker. Next cheap step is G3 economics (`$0.18` / `$0.05`) without a paid run — not a live listing.
