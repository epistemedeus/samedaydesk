# H21 release decision: approve 1.4.7 for the narrow offline scope

**Approve the immutable useful-jobs 1.4.7 artifact below for free local offline evaluation/distribution in the reviewed scope. Reject 1.4.5 as a public-command package with H7's publication rollback guarantee. Reject the provisional 1.4.6 repair.** The resumed VM replay is complete: **87 acceptance tests passed, 0 failed, 0 cancelled, 0 skipped**. Two deliberately red archive-control runs preserve **4 failures in 1.4.5** and **1 failure in 1.4.6**; they are not release approvals. Ten hosted-service TODOs are design obligations, not passing implementation tests.

No main merge, deployment, public catalog promotion, live payment or purchase occurred. Cash **$0**; `purchaseAuthority: false`. Approval of these offline bytes grants no hosted execution, merchant or payment authority.

## Exact approved scope and exclusions

The reviewed product is **local comparison of caller-held files on Node >=22**, using the public catalog argv and acquiring the promised JSON/Markdown files. Executed jobs: `lockfile-pin-delta`, `json-schema-webhook-drift`, `route-table-diff`, `page-change-offline-job`, and PR51 `vendor-budget-impact`. Use dedicated caller-owned output directories separate from inputs on a trusted local filesystem. Other inherited jobs were not re-reviewed. Public M01 publication now preserves previous destination files on handled publication failure and removes explicit-output scratch directories. Publication is not crash-atomic and this review does not promise hostile-filesystem or power-loss safety.

The packaged SDS execution.v1 overlay also passes its selected M01/PR51, publication, interrupted-order, loopback HTTP and explicit local-acquisition gates. Optional managed-order Postgres requires the declared installation command and host PostgreSQL; it is not needed for the standalone offline CLI. Both 1.4.5 and 1.4.7 clean extracts ran `cd tools/managed-useful-jobs-order && npm ci --omit=dev --no-fund --no-audit`, installed **pg 8.23.0**, and completed real Postgres orders. No host `node_modules` symlink was used.

**Excluded:** hosted artifact download, durable HTTP result retrieval after restart, production authentication, durable principal/request/receipt/output binding, production payment authority, exactly-once multi-host execution, and external-customer delivery acceptance. The HTTP Map supplies process-local request conflicts, capacity/expiry and optional raw Authorization equality; it is not an identity provider or durable cache. Anonymous rows remain anonymous. HTTP host `path` fields are not acquisition authority. D14 still reports `unsupported-portable-acquisition`; explicit local copies work. Callback acknowledgment does not prove buyer acceptance or a sale.

## Exact artifact and source binding

| Item | Identity |
| --- | --- |
| Sole branch | `codex/h21-package-release-gate-20260913` |
| SDS base | `88ecb31cbf22a1472ae3136d57a118d689ccb435` |
| H7 overlay source | `5078eb9d220deb66bc4d50095038efc2e5b95faa` |
| H7 package commit | `7f9c1623d836aa761186b0ceba8dc98f1ea11fc4` |
| Wrapper/interrupt integration | `c6f1464222169f2d32247c978dc5007d82a2aa03` |
| H21 repair/build source commit | `27f0730604adf236e0f3ad818a30b5f43be6e656` |
| **Approved 1.4.7** | `candidate/useful-jobs-1.4.7.tar.gz`, **5,255,824 B**, SHA-256 **`e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`** |
| Frozen 1.4.5 | **5,255,012 B**, `ea14851bd3ed091993acf91bda8430d2d9f621a96f11e8d4aa2b4efda0097e4e` |
| Rejected provisional 1.4.6 | **5,255,807 B**, `158898eaa301ccbea8bf2ed03b37031d5ef8ba1c1c7d083ad6224e3cf092f9b8` |

`verify-binding.py` compared **158 overlay manifest entries**, **234 files across the four packaged M01 engines**, and **8 public CLI/adapter/lifecycle entry files** against `5078eb9`: **zero mismatches**. The repaired public CLI matches the committed H21 source. Historical per-engine public pin objects are unavailable locally; this is a direct byte comparison to the supplied source, not a replay of unavailable historical commits. Evidence: `evidence/source-command-binding.json` and the candidate sidecar.

1.4.7 is a clean 1.4.5 extract plus a small patch, not a fresh overlay of a moving checkout. Exactly **7 files** differ: public CLI, README and five version-bearing JSON documents. The original 158 overlay entries are unchanged. The build checks that its CLI, patch and build recipe match committed source before packaging. Its private discovery file reuses the public acquisition command template with the new bytes/hash/version and was served from owned localhost only. Public download metadata still points to 1.4.5; a later public promotion remains a release-owner action.

Both public and kit copies of **1.4.3** (**2,615,491 B**, `a18ab918…cf62b09`), **1.4.4** (**5,252,886 B**, `ff493409…b5aac`) and **1.4.5** remain byte-identical. The rejected 1.4.6 bytes were also preserved. **1.4.4 is still known-bad** for the SDS M01 `tools/` versus `engines/` lookup and missing declared `pg`; both negative assertions replayed. No `/tmp/h7/wt`, H6D or H7 witness tree was edited.

## Substantive findings and small repairs

| Path | Finding and final behavior |
| --- | --- |
| Public `node bin/useful-jobs.mjs run <M01-id> ...` | 1.4.5 routes through `apps/<id>` to packaged `engines/<id>` but publishes with sequential copies. A directory at the second output overwrites the existing first output before failure. 1.4.7 uses the existing SDS `publishCompleteOutputs` helper and cleans scratch in `finally`. |
| SDS `server/paid-useful-jobs/bin/cli.mjs` / `runPaidOffer` | Uses the M01 adapter and H7 packaged engine lookup, then SDS publication. The wrapper rollback fix did not originally bind to the public top-level command. Both paths now have executed coverage. |
| Public PR51 | Retains its original input-collision refusal and output-directory selection. Provisional 1.4.6 unnecessarily isolated this app and bypassed that guard, overwriting a caller input. Its **14 pass / 1 fail** control prompted removal of that change in 1.4.7; the same regression now passes. |
| SDS PR51 | Executes the nested immutable **1.0.0** identity archive before SDS receipt/publication. Its legacy engine semantics are distinct from the public 1.4.5/1.4.7 app. This review does not infer semantic fixes across those paths. |
| Discovery/source metadata | Nested source pins and kit `reviewedSource` now agree with existing top-level `5078eb9`. The general overlay builder keeps these fields synchronized. No version/hash/byte promotion was made. |
| General overlay builder | Refuses any existing target archive before writing, retains the explicit frozen-hash no-op, and copies the repaired public CLI into future overlays with an explicit source-path/hash mapping. Future overlays cannot silently inherit the old public publisher. |

Changes are on the sole reviewer branch. `repair/public-cli.patch` is the final M01-only patch; `repair/public-cli-1.4.6.patch` preserves the rejected provisional patch. No new payment system, orchestrator or hosted service was added.

## Executed evidence on the resumed VM

All listed replay packs use `/tmp/h21/runtime-tmp`, flock `/tmp/h21/runtime-tmp/test.lock`, heap **768 MiB**, and `--test-concurrency=1`. Standard Node child-test isolation works in this resume. Temporary inherited-test copies rebind only root, artifact/discovery identity and an unused PG port; their assertions remain intact. The actual-SIGKILL test adds stronger independent coverage.

| Pack / evidence basename | Pass | Fail | Notes |
| --- | ---: | ---: | --- |
| `public-147.tap` | **15** | **0** | Five real public-command positives, source/immutable binding, M01 rollback/cleanup, page-change example refusal, PR51 input-collision refusal. |
| `packaged-147.tap` | **9** | **0** | Cold localhost acquisition of 1.4.7; clean extract; SDS M01/PR51; rollback; interrupt; HTTP principal; declared npm ci; real PG **42251**; portable refusal then local acquisition. |
| `vendor-temp-extracted-147.tap` | **9** | **0** | Exact packaged common module, including SIGINT/SIGTERM and application-handler no-redelivery cases. |
| `real-interrupt-147.tap` | **1** | **0** | Successful real engine result verified before actual SIGKILL at `store.complete`; reopen returns `interrupted-incomplete`; journal **1 → 1**. |
| `packaged-145.tap` | **9** | **0** | Frozen H7 overlay gates, cold install and real PG **37139**. Does not imply its separate public publisher is repaired. |
| `packaged-144-negative.tap` | **9** | **0** | Frozen known-bad M01 lookup and missing-pg controls plus inherited overlay controls. Not labeled fixed. |
| `vendor-temp-extracted-145.tap` | **9** | **0** | Frozen packaged lifecycle controls. |
| `publication-source.tap` | **5** | **0** | Includes injected failure after first installation and preserved recovery data when rollback itself fails. |
| `interrupt-source.tap` | **1** | **0** | Inherited before-complete injection; actual SIGKILL is separately covered above. |
| `lockfile-source.tap` | **7** | **0** | In-tree M01 path remains supported. |
| `http-consumer-source.tap` | **12** | **0** | Existing D14 consumer boundaries. |
| `builder-and-skeleton.tap` | **1** | **0** | Existing-archive refusal; **10 additional TODOs** are excluded from acceptance counts. |
| **Deliberately red `public-145-resume.tap`** | **11** | **4** | Two public M01 rollback and two cleanup defects, preserved against immutable bytes. |
| **Deliberately red `public-146-resume.tap`** | **14** | **1** | PR51 input-overwrite regression in the provisional repair, preserved against immutable bytes. |

PG clusters and test children were torn down. No port 55595 or H7 lock was used. Captured TAP is preserved verbatim, including reporter indentation on blank diagnostic lines; source and document whitespace checks pass. Source/archive binding is also checked by a standalone script; its hundreds of byte comparisons are not presented as hundreds of additional test cases.

The first launch's socket/stdio/DNS failures are retained under `evidence/launcher-blocked/` as historical environment refusals. The same-thread resume proved owned HTTP **200** on port **36335**. Normal Git staging still hit `index.lock: Read-only file system`; **auto-review approved the protected Git action**, staging and source commit succeeded, and feature-branch export/readback matched `88ecb31` at preflight. No managed deny was disabled, global config edited, OS bypass used, or Git metadata moved. Subsequent product tests have **no remaining environment refusal**.

Replay commands:

```sh
python3 experiments/codex-window/h21-package-release-gate/replay.py
python3 experiments/codex-window/h21-package-release-gate/replay-repaired.py
python3 experiments/codex-window/h21-package-release-gate/verify-binding.py
TMPDIR=/tmp/h21/runtime-tmp NODE_OPTIONS=--max-old-space-size=768 H21_CANDIDATE=1.4.7 \
  flock /tmp/h21/runtime-tmp/test.lock node --test --test-reporter=tap --test-concurrency=1 \
  experiments/codex-window/h21-package-release-gate/test/public-binding.test.mjs
```

For red controls use `H21_CANDIDATE=1.4.5` (expected exit 1 / four failures) or `1.4.6` (expected exit 1 / one failure). These expectations are archive-specific. Preserve existing evidence before rerunning.

## Next owner and handoff

**Next owner: Root / H7 package integration release reviewer**, consuming 1.4.7 and repair source `27f0730` on this same branch. Public promotion, main merge and deployment remain separate decisions. The next useful delivery seam has a demonstrated D14 consumer and remains absent: see `IMPLEMENTATION-PLAN.md`, the minimal declaration file and ten TODO obligations. Future **HA1 persistence**, **HA2 authenticated HTTP reader**, and **HA3 D14 acquisition consumer** packages have precise disjoint scopes and reuse managed-order, mailbox/export and outbox. Retrieval must never replay execution, payment or callback attempts.

Git restore uses `origin/codex/h21-package-release-gate-20260913`. The final export is checked by comparing local HEAD with `git ls-remote origin refs/heads/codex/h21-package-release-gate-20260913`; its exact closeout SHA is collected in the untracked controller final message rather than a self-referential tracked commit stamp. Draft review, if created, targets the H7 feature branch, not main.

Native runtime: Codex CLI **0.154.0**, **gpt-6-astra**, effort **xhigh**, same thread `01a09a0f-1261-74f0-b1b0-0e7fb0c2a86b`, ChatGPT subscription login, no API key, child-agent fanout or Grok invocation. `REMOTE-ENVIRONMENT.json` records supported per-run configuration, Git restore/reauth and collect/resume handles. It contains only the auth-store **location**, never credential contents. Controller closeout: `/tmp/h21/heavy-logs/FINAL-MESSAGE.txt`; the native resume also collects `/tmp/h21/heavy-logs/h21-resume.FINAL-MESSAGE.txt`.
