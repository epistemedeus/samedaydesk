# CW63 consumer integration closeout

Status: **done for the narrow consumer patch**. No implementation remains in this scope. This is source integration and local runtime acceptance, not production or full-engine readiness. Next integration owner: **Grok Heavy acting as W5-D01**.

Execution host: enrolled **Grok VM/node_grok_bot_vm**. The hostname `cursor` does not identify a Cursor Cloud VM. This was the authorized existing-source Astra closeout; no model CLI or agent was invoked by the implementation task. Future substantial work belongs on an actual Cursor Cloud host.

## Exact source boundary

- Repository: `epistemedeus/samedaydesk`.
- Feature branch: `codex/cw63-failure-policy-integration-20260912`.
- Integration base: `76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be`.
- D21 `01a2290865853552c5bfcedf26193d5acf026897`: only `tools/failed-delivery-dossier/` imported.
- D22 `6c7bf7fdbc360f215864e4c8aee4c7bb03e194ff`: only `tools/refund-obligation-projector/` imported.
- D23 `8fe0b808a2a0e269b7731ca738361890d02501d6`: only `tools/extract-unpaid-honesty/` imported.
- Additional owned path: `experiments/codex-window/cw63-failure-policy-integration/`.

The 95 imported donor files are enumerated with original and repaired blob IDs in `evidence/source-provenance.json`. Original package receipts, fixtures and notices are retained; donor experiment receipts are preserved under `evidence/original/`. Their historical pass counts, pins and model descriptions are archival evidence, not this run's claims. No old runtime was merged or executed by a historical pin check.

Shared dependencies remain byte-identical to the integration base: `server/paid-useful-jobs/`, `vendor/neomorphic-correspondence/`, `experiments/wave5/m01/`, `tools/lockfile-pin-delta/`, and published useful-jobs archives. Their exact Git tree IDs and latest local commits are in `evidence/source-provenance.json`. No newer dependency head was fetched or substituted; concurrent owner advances are outside this acceptance.

## Implemented interfaces

- D21 `lib/execution.mjs` consumes current `execution.v1`. Refusal, no-change, missing output, transport failure and unknown facts remain distinct. No-change is derived from explicit engine counts for lockfile-pin-delta, not from the generic informational label. Wrapper/receipt contradictions are refused. Full execution source and IDs remain in the dossier.
- D21 retains captured HTTP status: an external 500 cannot become a 402; external checkout is not extract evidence. Historical pin checking reads Git objects without creating old worktrees.
- D22 `lib/failed-dossier.mjs` exports `projectFailedDossier(dossier, { policy })`. CLI: `node tools/refund-obligation-projector/bin/project.mjs --dossier <file> [--policy <file>]`. The new schema is `samedaydesk.failed-job-policy-projection.v1`; the historical settlement projector remains available.
- Projection re-derives classifications from retained source. It requires exactly one wrapper execution, keeps other observations as non-execution context, never substitutes jobId for settlement operationId, and emits null amount and unknown buyer class when no payment classification exists. A not-attempted settlement declaration is distinct from absent/unknown settlement evidence.
- No policy means `unknown`. The explicit local control policy changes the matching unfunded refusal to `not-offered`; it does not assert an obligation, amount, settlement or payout. The policy fixture is a test document, not production refund terms. Policies requiring content-hash terms remain `terms_unverified`: the current compiled vendor package has no `hashTermsVersion` export. See `evidence/compiled-binding.json`; unlike documents are not forced to share a hash.
- Real PostgreSQL stores the new projection in `failed_job_policy_projections` with no-amount, no-settlement, explicit-policy and no-payout constraints. The existing settlement projection table remains intact. Disposable PostgreSQL uses an owned short socket directory, port 55593 by default, and verifies shutdown before deleting its files.
- D23 separates quoted payment text and echoed guard errors from observed request attempts. Missing observation means unknown escape, not proof of escape. Spawn failure, missing body and valid refusal stay distinct. `osIsolation` remains false; JS hooks and text scans are not an OS boundary. Owned intercept paths are cleaned on stop.

The actual wrapper is native Node ESM (`server/paid-useful-jobs/bin/cli.mjs`); it requires no compilation. The existing compiled vendor module was imported read-only, with its actual bytes hashed. No fake compiled terms binding was supplied.

## Verified acceptance

Node v22.23.2; existing PostgreSQL 17; heap 768 MiB; test concurrency 1; loopback HTTP on ephemeral ports. No new install occurred during closeout. Dependencies installed before closeout used the existing lockfile with scripts disabled.

From repository root, after the standard locked dependency install if needed on a new VM:

```sh
NODE_OPTIONS=--max-old-space-size=768 REFUND_PG_PORT=55593 \
  node --test --test-concurrency=1 \
  tools/failed-delivery-dossier/test/*.test.mjs \
  tools/refund-obligation-projector/test/*.test.mjs \
  tools/extract-unpaid-honesty/test/*.test.mjs \
  experiments/codex-window/cw63-failure-policy-integration/test/*.test.mjs
```

- `evidence/closeout-tests.tap`: **95 pass, 0 fail, 0 skipped**.
- After the final D23 unknown-escape correction, `evidence/closeout-final-focused-tests.tap`: **40 pass, 0 fail, 0 skipped**, covering D23 and the integration suite. The unaffected D21/D22 tests are covered by the 95-test run.
- The integration suite executes fresh production-wrapper CLIs for HTML refusal and identical lockfiles, validates actual output bytes/digests, runs fresh projector CLIs with and without policy, and exercises real PostgreSQL projection/rejections.
- `evidence/fresh-dossier.json`, `fresh-projection-no-policy.json`, `fresh-projection-explicit-policy.json` and `fresh-cli-controls.json` preserve one actual execution-to-policy trace. These JSON artifacts include historical temporary paths as capture metadata; reproduction uses repository fixtures and tests, not those paths. Set `CW63_EVIDENCE_DIR` to an existing output directory while running the integration test to capture a fresh trace.

## Expected negative controls and incomplete coverage

Expected nonzero controls are separately recorded in `evidence/fresh-cli-controls.json`: refund execution, posting paid and revenue summation each refuse with exit 1. HTML refusal exits 2 while transport remains okay. `fixtures/control-wrapper.mjs` seeds transport failure and missing output through the real wrapper, explicitly using a fake engine; those are consumer controls, not real-engine readiness. PostgreSQL rejects paid-out writes, missing paid-out facts and payable claims. Catalog-only, unpaid 402, quoted payment text, integer terms and contradictory receipt cases are also covered.

Earlier evidence is preserved without promotion to passing readiness:

- `evidence/baseline-tests.tap`: 66 pass, 2 PostgreSQL startup failures under the original long temporary path. The repaired short socket path passes; the baseline's lost startup log prevents claiming a more specific proven cause.
- `evidence/closeout-integration-tests.tap`: 13 pass, 1 assertion failure because PostgreSQL rejected the payable control via the explicit-policy constraint first. The control now targets the explicit-policy row and passes the intended nonpayable constraint check.
- `evidence/integration-tests.tap` and `evidence/engine-regression.tap`: interrupted pre-closeout attempts without final suite summaries. They are **incomplete**, not passes and not a confirmed engine regression. Full shared-engine acceptance was not rerun during this narrow closeout.

## Remaining owner steps

No consumer implementation remains. W5-D01 should review this feature export, then separately validate the vendor owner's final dependency head and full engine suite. Any new consumer adaptation stays exclusively in the four owned paths above; vendor/runtime/engine changes remain with their owners. A real funded-terms binding would require a separately reviewed dependency/interface update. Existing behavior correctly leaves those policy claims unknown.

This patch sends no refund, signature, provider mutation, real payment, credential operation or outreach. It asserts no revenue, banked balance or production deployment. Default branches and releases are untouched.
