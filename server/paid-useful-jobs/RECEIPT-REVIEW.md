# F08 RECEIPT-REVIEW — paid wrappers of existing useful jobs

**Date:** 11 September 2026
**Reviewer run:** `bc-797312fe-6a91-4c27-9d67-06ef14ac9936` (I02 bounded re-review)
**Prior incomplete reviewer:** `bc-145f17ff-7a1e-459a-9d0e-2b39e7d68fad` / `run-acded250-abd4-4727-909d-ec78333a5200`
**Branch:** `fable/f08-paid-wrappers`
**Draft PR:** [sds#52](https://github.com/epistemedeus/samedaydesk/pull/52) (left draft; not merged)
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs)
**Owned directory:** `server/paid-useful-jobs/`

## HEAD reviewed

| Item | SHA |
| --- | --- |
| PR 52 pin at re-review start (origin had not moved) | `95d9d21869717e26c80d17cee3933a0350aeee1e` |
| Implementation HEAD this receipt judges | `ab2d42419f59a85839b8408555cb32c1bf05640f` |
| Extra commit from this re-review | `ab2d424` — structured CLI rejection for unknown job ids |
| This file | landed in the following commit on the same branch |

`origin/fable/f08-paid-wrappers` was `95d9d218` at start. No reset. Writer commits `e935bd8` + `b4af5a2` and first-reviewer SAMPLE rejection `95d9d218` were kept.

**Verdict: ready**

## Why this re-review existed

Wave-1 SDS boundary receipt was incomplete: the first reviewer moved PR 52 from `b4af5a25` to `95d9d218` after noting SAMPLE/`--example` still received `reserved-fixture` funding, then did not land `RECEIPT-REVIEW.md`. This run finished that receipt and re-checked the follow-up.

First-reviewer commit `95d9d218` does reject SAMPLE provenance as a reserved-fixture sale. Verified by tests and CLI (below). `sold` was already false; the gap was treating sample provenance as a paid reservation.

## Source vs brief

Original dispatch file `overview/research/cursor-wave-20260911/dispatch/F08.md` is not in this repository and was not retrievable from public GitHub search in the reviewer environment. Judged against the restated F08 criteria plus current SDS source.

Contradictions vs a naive “unpacked engines + x402 ResourceServer” reading, recorded by the writer and confirmed:

- Engines are **not** unpacked source under `client/`, `server/`, `tools/`, or `experiments/`. They live in `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`. Live bytes on disk: **2522418**, SHA256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`. Wrapper extracts, verifies size+sha256, then `node bin/useful-jobs.mjs run <id>`.
- Extracted kit: package `useful-jobs` **1.0.0**, `engines.node` `>=22`, Node here `v22.14.0`. `purchaseAuthority` is false on kit metadata (`client/src/data/usefulJobsKit.json`) and wrapper receipts; the extracted `package.json` has no `purchaseAuthority` field (wrapper still emits `false`).
- SDS Express has **no** x402 ResourceServer. Wrappers use a local non-settling envelope. Continuity is a local copy of merchant PR54 `a143898dd1ec35c097ca7eb0b472f30dad1ee319` `indexing-payload-continuity.mjs`: fill absent `paymentPayload.resource` / `extensions.bazaar` only; never abort verify/settle for hint shape; does not reassign `verifyPayment` / `settlePayment`; signed `payload` (authorization + signature) is untouched. Compared read-only to merchant; no merchant-repo commits.

Public job pins verified from live `client/public/for-agents/useful-jobs/catalog.json` (not the brief table):

| Job id | Title | Required inputs | Outputs |
| --- | --- | --- | --- |
| `api-upgrade-brief` | API Upgrade Brief | `--before` `--after` `--used` | `upgrade-brief.json` `.md` |
| `vendor-budget-impact` | Vendor Budget Impact | `--before` `--after` | `budget-impact.json` `.md` |
| `feed-agenda` | Feed Agenda | `--before` `--after` | `agenda.json` `.ics` |
| `evidence-ci-annotation` | Evidence CI Annotation | `--input` | `annotations.json` `.md` |
| `listing-repair-packet` | Listing Repair Packet | `--input` | `repair-packet.json` `.md` |
| `repeat-job-record` | Repeat Job Record | `--next-run` optional `--input-root` | `repeat-job.json` `.md` |

Matches the brief. Samples stay labelled SAMPLE and require `--example`. Funding states: `unfunded | reserved-fixture | rejected`. `sold` always false.

## Commands / pass-fail

```bash
npm run test:paid-useful-jobs
```

**PASS** — 27 tests, 0 fail (`node --test server/paid-useful-jobs/test/*.test.mjs`).

Counts: writer reported 22 at `e935bd8`; `95d9d218` added SAMPLE reserved-fixture regressions (26 at re-review start); this re-review added 1 CLI unknown-job test (27).

PR diff vs `main` is `package.json` (`test:paid-useful-jobs` script only) plus `server/paid-useful-jobs/`. Homepage CSS/brand untouched. No deploy, no live payment, no new account/chain/queue.

## Journey evidence

Command (from repo root):

```bash
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --after server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json \
  --funding reserved-fixture \
  --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json \
  --out-dir /tmp/paid-vendor-budget
```

**PASS** (exit 0). Caller files are labelled `caller`, not SAMPLE. Engine reused (`useful-jobs` 1.0.0). Usable outputs + receipt:

| Artifact | Result |
| --- | --- |
| `/tmp/paid-vendor-budget/budget-impact.json` | 1443 bytes, `status: actionable`, fieldChanges=2, `purchaseAuthority: false`, `exampleMode: false` |
| `/tmp/paid-vendor-budget/budget-impact.md` | 472 bytes, recommended reviews for `desk-chat-input` / `desk-chat-output` |
| `/tmp/paid-vendor-budget/receipt.json` | `fundingState: reserved-fixture`, `sold: false`, `sample: false`, `purchaseAuthority: false`, `liveSettlement: out-of-scope`, `liveSettleAttempted: false`, `liveSettleAllowed: false` |
| fixture price on receipt | labelled non-live `0.02` USDC / `20000` atomic, payTo `0x0000…0F08`, `publishedToLiveCatalog: false` |

Continuity on this run: `declinedPayment: false`, `untouchedAuthority: true`. Labelled fixture payload is Exact-EVM v2-shaped, so the receipt also records `wouldSettleIfGuardOmitted: true`; the wrapper still does not call `settlePayment` on the success path. Local `settlePayment` throws `live-settle-out-of-scope` when invoked (seeded test).

## Seeded-failure evidence (fixture never a sale)

### 1. SAMPLE / `--example` treated as a live / reserved-fixture sale

First-reviewer follow-up **does** reject this path. CLI:

```bash
node server/paid-useful-jobs/bin/cli.mjs run vendor-budget-impact \
  --example \
  --funding reserved-fixture \
  --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json
```

**PASS fail-closed** — exit 2, `code: sample-not-a-sale`, `fundingState: rejected`, `sold: false`, `sample: true`, `sampleReasons: ["example-flag"]`, `liveSettleAttempted: false`. Same rejection when CLI synthesizes a fixture payment from `--funding reserved-fixture` without `--payment`.

Also covered by tests `(a)` live-sale+settle, `(a2)` reserved-fixture, `(a3)` kit `samples/` path, `(a4)` SAMPLE-labelled listing copy, and journey `--example` + reserved-fixture.

Unfunded `--example` remains allowed (labelled sample output, `fundingState: unfunded`, `sold: false`). That is not a sale.

### 2. Missing required input

```bash
node server/paid-useful-jobs/bin/cli.mjs run api-upgrade-brief \
  --before server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json \
  --funding reserved-fixture \
  --payment server/paid-useful-jobs/fixtures/payment/reserved-fixture.json
```

**PASS fail-closed** — exit 2, `code: missing-required-inputs`, `fundingState: rejected`, `sold: false`. Message lists `--before, --after, --used`.

### 3. Fixture payload that would settle if the fixture guard were omitted

Stripped `fixture` / `label` / `live` / `purchaseAuthority` and set `accepted.payTo` to the live extract payTo. CLI `--payment /tmp/omitted-guard-payment.json`:

**PASS fail-closed** — exit 2, `code: fixture-cannot-live-settle`, `fundingState: rejected`, `sold: false`, `liveSettleAllowed: false`. Envelope `settlePayment` also throws `live-settle-out-of-scope`. `--settle` on a labelled fixture is `live-settle-out-of-scope`.

### Extra small defect fixed in this re-review

CLI `run not-a-real-job` previously threw from `getJob` (stack trace, exit 1) before `runPaidOffer`. Now JSON rejection `code: unknown-job`, `sold: false`, `fundingState: rejected`, exit 2. Regression in `test/journey.test.mjs`.

## Prices / signature authority unchanged

`git diff 5b97d1b..HEAD` does not touch live catalog, OpenAPI, `Mcp.tsx`, or discovery kit metadata.

| Pin | Observed |
| --- | --- |
| extract | `client/src/pages/Mcp.tsx` still `price: "$0.005"` |
| buyer-runtime catalog | `mcpPriceUsd` `"0.005"`, `contract.priceUsd` `0.005`, `payTo` `0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee` |
| seller-integrity-audit | `fixtures/presence/catalog/openapi.json` `/commerce/seller-integrity-audit` amount `"0.01"` |
| useful-jobs discovery | `purchaseAuthority: false`, `paidHostedClaim: false` |
| wrapper fixture amount | `0.02` USDC, not published to the live catalog, distinct from extract / SIA |

Signed payload fields are not rewritten by continuity (tests fingerprint `payload` + accepted terms + unrelated extensions).

## Known gaps

- Live settlement, facilitator, catalog publication, and deploy remain out of scope (brief).
- Declared `https://samedaydesk.com/paid-useful-jobs/<id>` URLs are indexing hints, not live routes.
- Writer `RECEIPT.md` still pins HEAD `e935bd8` and “22 tests”; later commits `95d9d218` / `ab2d424` are not reflected there. This file is the re-review receipt.
- Dispatch `F08.md` path from the original brief was not present in-repo; no contradiction against SDS source beyond the engine-location / no-ResourceServer points above.
- Unfunded SAMPLE/`--example` still produces usable labelled sample output. That is intentional and is not `reserved-fixture`.
- CLI `--payment` path that is missing or not JSON still throws uncaught (not a sale path; not expanded).
- No homepage CSS/brand changes. No EIN/Neo/Pilot product edits. No merchant-repo commits.

**Verdict: ready**
