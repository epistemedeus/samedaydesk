# H4 — Family G precise repairs pack (Heavy-primary implementation)

You are Native Grok Heavy implementing this pack on `epistemedeus/samedaydesk`.
Cursor Auto launched you; you own all code, tests, docs, git commit/push on the feature branch.

## Identity / repo

| Item | Value |
| --- | --- |
| Repo | `/workspace` → `https://github.com/epistemedeus/samedaydesk` |
| Start HEAD (SDS main / PR51) | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| Feature branch (already checked out) | `fable/h4-precise-repairs` |
| Own directory ONLY | `experiments/cursor-wave-20260911/h4-precise-repairs/` |
| Merchant pin (read-only fixture already copied) | `fixtures/merchant-pr54/indexing-payload-continuity.mjs` from x402-url-extractor PR54 `a143898dd1ec35c097ca7eb0b472f30dad1ee319` |
| SDS engines (subjects, not paid wrappers) | PR51 six offline useful jobs in `client/public/for-agents/useful-jobs/catalog.json` |

## Out of scope (hard)

- Do NOT implement Wave 1 F08 (paid wrappers of the six free jobs) or F01–F18 generally.
- Do NOT implement Wave 2 H1–H3 / A1–A3.
- Do NOT transplant bounty-intelligence (F03).
- No deployment, payment, secrets, overage, price changes, merchant PRs.
- Do NOT change live prices (extract `$0.005`, seller-integrity-audit `$0.01`).
- Do NOT reassign `verifyPayment` / `settlePayment`.
- Do NOT modify SameDayDesk homepage styles.
- Do NOT push to other repos. Push only `fable/h4-precise-repairs` on samedaydesk.
- Node 22. Prefer TypeScript compiled or plain `.ts`/`.mjs` runnable under Node 22 with `node:test`.

## Check current source first

Inspect SDS for the six jobs and any existing x402 ResourceServer hooks. Follow current source over this brief. Record contradictions in `RECEIPT.md`.

Reuse the six offline jobs as **repair subjects** (ids from catalog). Do not wrap them as paid catalog offers.

Copy accepted merchant hook rules into tests/fixtures (already seeded under `fixtures/merchant-pr54/`). Encode as **diagnostics**, not a second signer.

## Accepted merchant rules (diagnostics only)

- CDP Bazaar indexes `paymentPayload.resource` + `paymentPayload.extensions.bazaar`, not sibling `paymentRequirements`.
- Exact EVM EIP-3009: `@x402/evm` signs only `payload`; resource/extensions are attached outside typed data. Filling omitted route-owned hints does not change signed authority.
- Never abort verify/settle for discovery-hint shape mismatch. Preserve `payload` and accepted terms.
- Presence-only diagnostics. No secrets.

## Domain shape (name these types first; literal)

```ts
type RepairIntake = {
  defectId: string;
  suppliedInput: { digestSha256: string; mediaType: string; bytes: number };
  scope: string;
  acceptanceTest: string;
  rollback: string;
  provenance: "fixture" | "test" | "customer";
  saleState: "not_a_sale";
};

type MetadataDiagnostic = {
  field: "resource" | "extensions.bazaar" | "payload" | "other";
  present: boolean;
  signed: boolean; // payload signature authority vs unsigned indexing hint
  drift: "none" | "missing_hint" | "mismatch" | "unknown";
};

type CanaryDesign = {
  purchaseCap: { amount: string; asset: string; network: string };
  ownerQa: true;
  externalRevenue: false;
  authorized: false; // remains false until a real operator-authorized purchase exists
};
```

Rules:
- Fixture / SAMPLE / `--example` input cannot enter `provenance=customer` or any sale/settled state.
- `saleState` is always `"not_a_sale"` for this pack.
- `authorized=false` canaries must NOT call live settle (stub/refuse if attempted).

## Literal user journey (implement all three)

1. **Supplied-input repair intake:** accept a caller-supplied fixture of a declared mismatch (example: OpenAPI/Bazaar resource hint missing while payload signature is intact). Record defect, scope, test, rollback. Label `provenance: "fixture"`.
2. **Callback/metadata diagnostics:** compare fixture payload against PR54 rules. Report which fields are signed vs unsigned hints. Do not retry payment.
3. **Customer-funded canary design:** emit a canary plan object with cap strings, `ownerQa=true`, `externalRevenue=false`, `authorized=false`. Do not execute a purchase.

## Seeded failures that MUST be rejected (tests with literal expected objects)

1. **fixture-becomes-sale:** SAMPLE/`--example`/fixture intake marked paid, settled, or `provenance=customer`
2. live settle invoked from the canary design
3. diagnostic that treats an unsigned indexing hint as payment-signature authority
4. changing live prices or reassigning `verifyPayment` / `settlePayment`
5. missing supplied input accepted as a completed repair

## Deliverables inside own directory

```
experiments/cursor-wave-20260911/h4-precise-repairs/
  package.json          # name scoped; node:test scripts; type module or dual
  src/                  # RepairIntake, diagnostics, canary design, CLI
  tests/                # node:test — intake, diagnostics, canary, every seeded failure
  fixtures/             # merchant PR54 copy + sample mismatch payloads
  bin/                  # CLI entry if useful
  FEATURE-MAP.md        # exactly four H2s below
  RECEIPT.md            # compact; see required fields
  PROMPT.md             # this file (keep)
```

### FEATURE-MAP.md — four H2s only

1. `## Sub-features`
2. `## How to get to it (user POV)`
3. `## Driving it with CLI`
4. `## Gotchas`

Account prerequisite: none (fixtures only).

### RECEIPT.md must include

- SDS start HEAD
- branch name
- commands run + pass/fail
- Heavy session id(s)
- merchant pin used (`a143898dd1ec35c097ca7eb0b472f30dad1ee319`)
- contradictions vs brief (if any)
- No secrets

## Implementation guidance

- Prefer compact, real TypeScript or Node ESM. If TS, ensure tests run with Node 22 (`node --experimental-strip-types` or compile first — pick one and document in RECEIPT).
- CLI should support: repair intake from fixture path, run diagnostics on fixture, emit canary design JSON. Dry-run only.
- G01 is exact repair **proposal** design — no live $15 job.
- G03 input-contract repair: reject missing supplied input; require digest/mediaType/bytes.
- G05 canary is design-only; `authorized: false`.
- G06 diagnostics: presence-only; `signed: true` only for `payload`; resource/extensions.bazaar are unsigned hints (`signed: false`).

## Git / PR

1. Work only under `experiments/cursor-wave-20260911/h4-precise-repairs/` (plus nothing that changes homepage styles or live payment routes).
2. Run tests until green.
3. `git add` pack files, `git commit` with a clear message, `git push -u origin fable/h4-precise-repairs`.
4. Open a **draft** PR to `samedaydesk` `main` if `gh` write works; otherwise leave compare URL in RECEIPT. Do not merge. Do not deploy.

## Done when

- Tests reject fixture-becomes-sale and all other seeded failures
- FEATURE-MAP.md + RECEIPT.md exist
- Branch pushed
- You print a final JSON summary: `{ branch, head, testsPass, sessionId, prUrlOrCompare }`

Spawn subagents as needed; own them through completion. Do not ask Cursor Auto for help.
