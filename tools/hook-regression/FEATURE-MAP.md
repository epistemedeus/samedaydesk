## Sub-features

- **PR54 presence-only diagnostics.** Freeze merchant PR54 (`a143898dd1ec35c097ca7eb0b472f30dad1ee319`, module `indexing-payload-continuity.mjs`) as diagnostics: CDP Bazaar indexes `paymentPayload.resource` + `paymentPayload.extensions.bazaar`, not sibling `paymentRequirements`. `@x402/evm` signs only `payload`; resource/extensions are unsigned hints. Missing hints report `drift: "missing_hint"` with `signed: false`. Verify/settle are never aborted for discovery-hint mismatch.
- **Literal journey.** Intact fixture → omit bazaar hint → diagnostic `missing_hint` (`signed: false`) → signed payload authority unchanged (including a diagnostic-only fill of omitted route-owned hints) → a fixture that treats the hint as signed authority is rejected.
- **H4 import (read-only).** When `experiments/cursor-wave-20260911/h4-precise-repairs/` is in the workspace, or when `origin/fable/h4-precise-repairs` is fetchable, import H4 G06 fixtures and the PR54 planner. G02 never writes that tree.
- **Seeded fail-closed.** Reject unsigned hint as signature authority; rewriting `payload` to “fix” discovery; installing live ResourceServer hooks; changing live prices; editing the H4 directory.

## How to get to it (user POV)

Account prerequisite: none. Fixtures only. No wallet, facilitator, or live settle.

1. Point the journey at `fixtures/ok-payload.json` (intact Exact EVM v2 payload with unsigned resource and bazaar hints).
2. The CLI omits the bazaar hint, reports `missing_hint` with `signed: false`, and shows the `payload` signature slot is unchanged.
3. A fixture that marks the unsigned hint as signature authority is rejected.

## Driving it with CLI

From this directory, Node 22:

```sh
cd tools/hook-regression
node bin/hook-regression.mjs journey --fixture fixtures/ok-payload.json
node bin/hook-regression.mjs diagnose --fixture fixtures/ok-payload.json
node bin/hook-regression.mjs reject --fixture fixtures/unsigned-hint-as-authority.json
npm test
```

Root: `npm run test:hook-regression`.

## Gotchas

- This pack **asserts** PR54 rules. It does **not** duplicate merchant PR54: no `registerIndexingPayloadContinuity`, no live `onBeforeVerify` / `onBeforeSettle`, no `verifyPayment` / `settlePayment` reassignment.
- Filling omitted route-owned hints is diagnostic-only (clone). The caller’s `paymentPayload.payload` is never rewritten.
- `signed: true` is valid only for `payload`. `resource` and `extensions.bazaar` stay `signed: false`.
- H4 owns `experiments/cursor-wave-20260911/h4-precise-repairs/`. Import if present; never edit.
- Live extract `$0.005` and seller-integrity-audit `$0.01` are read-only pins. No deployment, payment, or secrets.
