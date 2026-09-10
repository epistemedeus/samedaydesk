# G2 — Grexal source-change evidence packager (dry)

Cell: S109 Stage-1 package. Cash boundary **$0**. No login, push, publish, or deploy.

As of: 2026-09-10.

## New fact

Vendored a `manifest_version` 3 Grexal agent under `surfaces/grexal/package` that packages a **git diff + acceptance report** and never calls a paid model.

- Runtime contract is `grexal.json` only (`entrypoint`, `runtime`, typed `input_schema` / `output_schema`).
- Marketplace name/description/category/tags/pricing/visibility are **not** in the manifest.
- Identity stub `.grexal/agent.json` is `{ "name": "samedaydesk-source-change-evidence" }` — `agentId` appears only after first `push` (not run).
- Unpacked `grexal@0.4.1` `validate` printed `Manifest valid ✓` without credentials.
- `npx grexal` was **not** invoked. `--help` ran from the G1 tarball.

## Runnable (from repository root)

```bash
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/validate-manifest.mjs
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs --table
node experiments/s109-marketplace-entry-trials/surfaces/grexal/package/agent/pack_evidence.js --repoPath . --baseRef HEAD --headRef HEAD --outDir /tmp/s109-grexal-dry-out
npm --prefix experiments/s109-marketplace-entry-trials/surfaces/grexal/package test
```

Tests: **8 pass / 0 fail**.

## Fee worksheet (docs formula, not a live quote)

`platform_fee = clamp(buyer_charge × 0.20, $0.02, buyer_charge × 0.30)`

| Buyer pays | Fee    | Seller | Binding |
| ---------- | ------ | ------ | ------- |
| $0.10      | $0.02  | $0.08  | 20%     |
| $0.08      | $0.02  | $0.06  | floor   |
| $0.05      | $0.015 | $0.035 | 30% cap |
| $0.18      | $0.036 | $0.144 | 20% (docs Claude example; **not** this agent) |

This packager has **$0 LLM cost**. Unpublished suggested line item: `run_completed 0.10`. Not applied.

## Authenticated step needed (Root, not this worker)

`grexal login` → first `push` → `agent set-description/set-category/set-tags` → `agent price add run_completed 0.10` → `publish`.

## Next

G3 buyer/economics cell: replay I/O from `grexal.json` without paying; keep the $0.18 / $0.05 clamp rows. Still no login.
