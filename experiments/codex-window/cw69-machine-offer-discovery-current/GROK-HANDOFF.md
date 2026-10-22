# CW69 foundation handoff

Status: **adapter implemented on this branch (H7-DISCOVERY, 2026-09-12)**.
The remaining-work list below is the foundation snapshot and stays historically
accurate. Verification, live GET notes, and limits are in [RESULT.md](RESULT.md).
No READY, payment, or catalog publication is claimed.

Earlier foundation closeout: the quota reset was reported by the user;
the controller classified CW69 as foundation-handoff. Implementation stopped
at that boundary until this native parent. The snapshot below describes that
handoff, not the current adapter.

Next integration owner: **native Grok Heavy, CW69**. One owner completes the
remaining adapter on an actual Cursor Cloud host. The exporting host's hostname
is `cursor`, but its enrolled provider is Grok VM / `node_grok_bot_vm`.
This export is the existing-source closeout exception. Do not start new
substantial builds on that host. No new admissions or delegation were made.

## Repository and exact inputs

- Repository: `epistemedeus/samedaydesk`.
- Existing feature branch: `codex/cw69-machine-offer-discovery-current-20260912`.
- Integrated base and inspected runtime: `a9aaa0f8a3bb996948e6033f743b62c4e5417882`.
- M12 source: `440c2c901329402b6bbaaafa29e1eb0b95dd6f01`; only
  `experiments/wave5/m12/` imported, 22 files.
- M13 source: `71a7335708669ceb6e460c36dc4eb6625ce7cad4`; only
  `experiments/wave5/m13/` imported, 20 files.
- Both source directories retain every original byte, receipt, test, license,
  and historical claim. `evidence/source-imports.json` records all file hashes.
  Source commits need not be available on the next VM to check these copies.
- Remote `main` readback during closeout:
  `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`. It differs from the requested base.
  No merge, refresh, rebase, shared-source update, or whole-branch import occurred.
- Integration/PR base branch: `codex/useful-jobs-core-integration-20260912`,
  read back at `30345f69f16aca93bb95511ee4da62975c98cc04`. It advanced after the
  requested base and stages 1.4.2. Relative to our frozen base it changes
  `client/public/discovery/useful-jobs.json`,
  `client/public/for-agents/useful-jobs/catalog.json`, and two runtime/catalog
  tests in the inspected scope. Our checkout still contains the 1.4.1 snapshot.
  This mismatch is recorded, not silently imported. Root/the integration owner
  must decide any later rebase; rerun identity checks if dependencies advance.
- Node used: `v22.23.2`, `NODE_OPTIONS=--max-old-space-size=768`, one test worker.
  No installation, compiler, PostgreSQL, Firebase emulator, or HTTP listener
  was needed for the foundation.

All paths below are repository-relative unless a path is explicitly relative
to this experiment. The new VM needs this feature branch, Git, and Node 22.
No retained VM-only toolchain or private file is needed for the recorded checks.

## Implemented foundation and interfaces

The implementation here consists of exact original consumers and a four-test
foundation check. There is no adapter CLI scaffold that could be mistaken for
working invocation. These existing interfaces are available to the next owner:

| Original interface | Use and limitation |
| --- | --- |
| `experiments/wave5/m12/lib/sources.mjs`: `sha256Bytes`, `sha256File` | Original hashing helpers; used by the foundation checks. Its full `loadSources` descriptor still carries historical assumptions. |
| `experiments/wave5/m12/lib/classify.mjs`: `classifyResult` | Can preserve current explicit transport/analysis/delivery fields. Do not use its fallback as proof of a current execution. |
| `experiments/wave5/m13/src/identity.mjs`: `selectById` | Selects exact string identity rather than array position. It chooses the first duplicate; the new adapter must reject ambiguous duplicates. |
| `experiments/wave5/m13/src/invoke.mjs`: `listCurrentJobs`, `invokeCurrentJob` | Real CLI subprocess wrappers. Only `listCurrentJobs` was executed here. Add strict exit, source, request, receipt, and artifact binding around invocation. |
| `server/paid-useful-jobs/bin/cli.mjs` | Current authoritative `list` / `run <job-id>` entry. Local non-settling execution, not paid HTTP. |
| `server/paid-useful-jobs/lib/jobs.mjs` + `experiments/wave5/m01/lib/d01-adapter.mjs` | CLI uses `createM01AwareGetJob(getJob)` to resolve effective required/optional inputs and outputs. |

`evidence/dependency-pins.json` contains 48 inspected file digests, the current
M01 CLI/input/output records, and comparisons of each declared source tree to
the integrated source tree. It is an inspection snapshot, **not a complete
executable closure or implemented invocation binding**.

| Selected M01 capability | Declared source commit | Integrated path matches pin |
| --- | --- | --- |
| lockfile-pin-delta | `5f0f189fd3e88eabfeca2b95b2da644e58374372` | yes |
| json-schema-webhook-drift | `989ea8155ee547546cb63b6ba97bc814b313fc20` | yes |
| route-table-diff | `989ea8155ee547546cb63b6ba97bc814b313fc20` | yes |
| page-change-offline-job | `e38f385a63c767f315409460bd51c57895fa4ed1` | yes |

The current CLI lists ten jobs with `firstOffer: lockfile-pin-delta`. Its
selected wrapper requires `--before` and `--after`, emits `pin-delta.json` and
`pin-delta.md`, and routes into `tools/lockfile-pin-delta/bin/lockfile-delta.mjs`.
The actual engine usage accepts npm package-lock v2/v3, compares pins and npm
install boundaries, and explicitly refuses unsupported formats. Compare the
CLI resolver with the engine usage: engine-only flags are not automatically
wrapper-supported inputs. `--example` is a mode, not a caller file path.

The pinned checkout's public free archive/catalog is 1.4.1. Its lockfile pin is still
`fba9d14872bc4c04214e527b9edfb30c2123c9e7`, distinct from integrated `5f0f189`.
The wrapper's legacy archive acquisition dependency remains useful-jobs 1.0.0;
selected M01 execution uses the in-tree engine. Do not replace these three
identities with one package version or claim all ten offline jobs are paid.

## Remote evidence, not a new registry

`evidence/remote/` contains unchanged response bytes and capture metadata.
The responses were acquired before the reset closeout instruction. Tests only
read them; they do not contact a live service.

- Official exact-version MCP record and merchant OpenAPI both read back
  **1.23.49**. The repository's old `versions-latest.json` fixture says 1.23.45.
  `isLatest` is a capture-time field, not an eternal latest-version guarantee.
- `POST https://agents.samedaydesk.com/lockfile-pin-delta` is an actual published
  route. OpenAPI advertises `compareLockfilePinDelta`, object inputs `before`
  and `after`, x402 only, and price 0.005 USDC. It does not advertise GET or MPP
  on this operation. Service-wide MPP availability does not imply this route
  supports MPP. MCP registration does not prove a tool invocation.
- An unauthenticated POST returned **402**, amount `5000` atomic USDC.
  `lockfile-request.json` is the exact request body; its digest matches
  `capture.json`. No authorization or payment was sent. The 402 document
  contains an illustrative successful output with `charged: true`; that is
  advertised example data, **not execution, payment, settlement, or revenue**.
- `GET /health` returned 404 and is recorded as such. The web reading tool
  rejected the URLs; bounded direct HTTP successfully captured the primary
  JSON endpoints. No browser or credential flow was used.
- Public archive acquisition is free offline software. The current local
  wrapper fixture price is 0.02 and non-live. The current local integration's
  hosted price remains unpublished; cost floor and monetary margin remain
  unknown. A published merchant price is not a measured cost floor.
- Candidate vendor source is not production. No candidate vendor was imported,
  executed, or deployed. These HTTP captures do not establish which exact
  candidate engine commit production runs; OpenAPI examples are not proof.

## Exact remaining work, in order

Exclusive write path for all new implementation, tests, and evidence:
`experiments/codex-window/cw69-machine-offer-discovery-current/`.
Keep `experiments/wave5/m12/` and `experiments/wave5/m13/` as exact imported
source evidence. Runtime, engines, source/public registries, and all other
experiments are read-only. CW21 generic contract auditing and CW60–65 delivery
consumers are different assignments; do not expand into those scopes.

1. Build one thin adapter, proposed entry `bin/offer.mjs`, with separate
   `discover`, `describe`, and `invoke` processes. Reuse the original consumer
   helpers where valid; do not copy engines or introduce a new registry.
   Limit the first executable path to the exact `lockfile-pin-delta` identity.
   Read current CLI `list` and effective resolver, inspect engine usage, and
   verify the actual supported caller files and promised outputs. Reject
   stale/ambiguous registry identity instead of choosing the first hit.
2. Define the discovery document as a derived inspection artifact. Bind full
   catalog bytes/digest, selected source tree/executable bytes, runtime entry,
   original consumer refs, exact merchant capture identity, and acquisition
   kind separately. Expose free kit, local run, published paid HTTP routes,
   protocol support, unknown costs, and unpublished local price distinctly.
   Never treat mutable `latest` or illustrative paid output as authority.
3. Have `describe` validate the discovery document against freshly inspected
   frozen source and bind caller input bytes and method. Have `invoke` reload
   and validate that same identity in a separate process before running the
   real current CLI. Reject unsupported methods/acquisition modes and changed
   catalog/body/source. Detect known copied samples by content, not filename
   alone; document the bounded sample detector honestly.
4. Execute only caller-supplied offline input. Bind the real receipt's job,
   engine provenance/executable, input/output digests, and actual artifacts to
   the discovery/description identity. Preserve distinct transport, domain
   analysis, delivery, and payment fields. A complete informational no-change
   analysis may be useful. Always keep local sold/purchaseAuthority false.
   Snapshot admitted bytes before execution so inspected bytes are executed.
5. Add the acceptance controls below with one worker and heap 768 MiB. Give
   each invocation an owned scratch/TMPDIR; clean only owned extracts and
   processes. Prefer loopback port 0 for HTTP discovery tests. PG 55669 is
   optional and unnecessary unless the implementation proves otherwise.
   Firebase, if needed, must use an owned ephemeral namespace.
6. Store raw receipts/output plus deterministic normalized discovery evidence.
   Separate volatile process IDs/paths/times from identity; preserve raw
   evidence. Update RESULT with actual verification and limitations, commit/
   push the same feature branch, and update its draft PR. Stop once this one
   path is complete. Do not merge/deploy/publish registries/spend/sign or
   contact customers. Root controls any new work admissions.

Proposed future interface (these commands are **not implemented yet**):

```sh
export NODE_OPTIONS=--max-old-space-size=768
cw69=experiments/codex-window/cw69-machine-offer-discovery-current
node "$cw69/bin/offer.mjs" discover --job-id lockfile-pin-delta --out /tmp/cw69-discovery.json
node "$cw69/bin/offer.mjs" describe --discovery /tmp/cw69-discovery.json --before "$cw69/fixtures/before.json" --after "$cw69/fixtures/after.json" --out /tmp/cw69-description.json
node "$cw69/bin/offer.mjs" invoke --description /tmp/cw69-description.json --before "$cw69/fixtures/before.json" --after "$cw69/fixtures/after.json" --out-dir /tmp/cw69-output
node --test --test-concurrency=1 "$cw69"/test/*.test.mjs
```

Acceptance controls still to implement:

| Control | Required observation |
| --- | --- |
| Unrelated first catalog/registry item | Exact requested identity wins; duplicate matching identities refuse. Foundation proves only the helper-level catalog case. |
| Stale 1.23.45, wrong name/remote, false latest | Refuse mismatch; no guessed current registry. |
| GET on POST-only route; paid method sent to offline adapter | Reject before invocation; no protocol inheritance from service-wide metadata. |
| Changed catalog, source, description or caller body between processes | Binding fails before execution; include rehashed tampered documents. |
| Renamed/reformatted known sample, explicit example, sample metadata | Cannot become caller/customer evidence or a sale. |
| Unknown acquisition; engine-root override; missing CLI/kit | Explicit refusal/transport failure, no fallback to unbound source. |
| Caller-authored before/after | Actual CLI produces pin-delta JSON/Markdown with one named changed dependency and expected fields. |
| Identical caller input | Informational useful output; not transport failure. |
| Missing input, unsupported lockfile version/format, input limit | Exact structured refusal; no invented output or READY. |
| Tampered receipt/artifact or different job/source | Reject mismatched hashes, job, provenance and promised outputs. |
| Offline free kit vs published route | 1.4.1 free package, integrated source, 1.0.0 wrapper dependency and 1.23.49 merchant remain separate. |

The two fixtures here are owner-authored synthetic caller inputs. They are
not independent customer activity, real dependency availability, paid value,
or a measured cost floor. Their registry URL strings are inert comparison
data; do not install them.

## Tests actually run and known failure

From the repository root:

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 experiments/codex-window/cw69-machine-offer-discovery-current/test/foundation.test.mjs
# exit 0: 4 pass, 0 fail; evidence/foundation-tests.tap

NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 --test-name-pattern='describe CLI emits' experiments/wave5/m12/test/cli-describe-verify.test.mjs
# exit 1: 1 fail; evidence/legacy-m12-check.tap
```

The preserved M12 assertion expects the historical six job IDs; current
description returns ten. The exact failing assertion is line 34 of the
original test. This is a reproducible source compatibility failure, not a
missing dependency or an engine crash. Do not rewrite historical evidence to
make this check pass. The adapter's current integration tests are still needed.
No broad M12/M13 suite, paid invocation, offline useful-output invocation,
delivery suite, compiler, emulator, or database suite was run.

`git diff --cached --check` reports trailing whitespace in preserved original
M12 Markdown (intentional Markdown hard breaks) and raw legacy TAP output.
Those source/evidence bytes were deliberately retained; this check is not
reported as clean. Newly authored code and handoff prose have no such findings.

The foundation used no installed packages and started no persistent process.
Assignment-owned TMPDIR was empty at closeout inspection. All useful source,
test logs, request/response bytes, and pins are included in this Git branch.
