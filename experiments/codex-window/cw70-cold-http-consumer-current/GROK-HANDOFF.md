# CW70 foundation handoff to native Grok Heavy

Status: **FOUNDATION, NOT READY**. The user observed the quota reset and explicitly
stopped Astra implementation at the foundation boundary. Continue this same feature,
not a new runner. Next integration owner: **native Grok Heavy, CW70 consumer owner,
on an actual Cursor Cloud VM**. The existing host was enrolled as Grok VM /
`node_grok_bot_vm` despite hostname `cursor`; it was not a Cursor Cloud VM.

## Outcome and preserved work

Only `experiments/wave5/d14/` was imported from the supplied D14 commit. Its 13
files remain byte-identical to that source. No repaired consumer implementation
has landed. An attempted patch to `lib/pins.mjs` was rejected atomically by
`apply_patch` for duplicate path operations; its subsequent input-encoder patch
was never invoked. Do not infer any implemented v2 ticket or verifier interface.

This experiment adds an immutable original-source archive and import patch,
a frozen 35-file runtime/source archive, a per-file SHA-256 manifest, baseline
observations, and five small regression specifications. One test passes and four
fail. No real HTTP runtime, engine, PostgreSQL, Firebase, or full test suite was
launched during this assignment. These are local owner probes, not independent
use, deployment, settlement, or completed delivery evidence.

Draft PR: https://github.com/epistemedeus/samedaydesk/pull/139.
Source/evidence checkpoint: `0faf749fd9071aced83dfd64c2e6de013a2a0a46`;
follow-up closeout commits contain documentation only. Continue the same branch.

## Exact inputs and dependency mismatch

- Repository: `epistemedeus/samedaydesk`.
- Existing feature branch: `codex/cw70-cold-http-consumer-current-20260912`.
- Assignment base and frozen runtime: `a9aaa0f8a3bb996948e6033f743b62c4e5417882`.
- Imported D14: `abd861927cda6e3501b4a35289a4b284695cc493`.
- Historical D14 runtime claim: `6bed72dd22a396134aa5c957933b42c3a5746698`;
  historical kernel `bccf34b3816ebe20d43823d0978308fd10f9bb33`;
  historical SDS52 `aeef964fa188443078958d9d6d393afae1d542ee`.
- Frozen runtime's engine archive: `useful-jobs-1.0.0.tar.gz`, 2,522,418 bytes,
  SHA-256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`.
  Its source commit is `0e473974554de9bfdba90676b6d3d710c10a2671`, archive freeze
  `318130daaf19490e2f8af7c23131b42fe20e6cde`.
- Read-only integration observation at closeout:
  `codex/useful-jobs-core-integration-20260912` at
  `30345f69f16aca93bb95511ee4da62975c98cc04`. Of the 35 frozen files, only
  `client/public/for-agents/useful-jobs/catalog.json` differs, changing the
  version from `1.4.1` to `1.4.2`. Execution code matches the frozen snapshot.
  Four selected engine source directories also have no diff between these refs.
- Observed `main`: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`. It lacks this
  execution core and is not the acceptance source. The draft targets the existing
  core integration branch. No merge, rebase, shared-source refresh or release
  change was performed.

The complete observations are in `evidence/dependency-observation.json`. These
are observations of exact refs, not a promise that remote branch tips stay fixed.
Keep the original archive and receipt immutable if root later admits a new pin.

## Durable files, usable from a fresh clone

All paths below are relative to this experiment directory unless specified.

- `evidence/source/d14-abd8619.tar`: original D14 tree with historical README,
  receipts, and tests, including their old claims and original author provenance.
- `evidence/source/d14-import.patch`: complete path-scoped diff from assignment
  base to supplied D14 source. No other source branch paths were imported.
- `evidence/source/runtime-a9aaa0f.tar.gz`: exact source files from the frozen
  assignment base, including the original public 1.0.0 engine archive.
- `evidence/source/runtime-manifest.json`: archive digest, size, source ref,
  selected paths, and SHA-256 of all 35 source files.
- `evidence/source/verification.json`: in-memory archive member/hash checks;
  verifies the D14 import equals its original archive. Runtime launch untested.
- `evidence/baseline.json`: original client accepts a wrong-identity, incomplete
  `ok:true` response and loses the retrieval identity after response loss.
- `test/consumer-foundation.test.mjs`: executable red specifications.
- `evidence/foundation-tests.tap` and `evidence/foundation-tests.json`: actual
  test output and exit status. Historical absolute stack paths are evidence only;
  no command or required dependency relies on them.

The runtime snapshot contains the execution wrapper import closure and M01 adapter
source, but not the separate M01 engine implementations. Vendor-budget-impact
uses the included original 1.0.0 archive. If adding M01 coverage, explicitly archive
its owned source from the admitted ref into a separate owned fixture and map that
cold engine root. Do not let `m01/lib/engine-root.mjs` fall back to an in-tree engine,
network Git fetch, or monorepo checkout. Runtime startup/import closure remains to
be tested, not assumed from the manifest check.

## Imported interfaces and authoritative runtime findings

The imported package exposes `encodeInputFile`, `encodeExecuteRequest`,
`assertNoFilesystemPaths`, `postExecute`, `getResult`, `getHealth`,
`classifyHttpExchange`, and `ticketFromSubmit`; CLI commands are `health`, `submit`,
and `fetch`. They are old interfaces, not a completed new contract.

Inspect the following files in the frozen archive or assignment-base tree:

- `server/paid-useful-jobs/lib/http.mjs`: `POST /execute` accepts optional caller
  `executionId`, validates `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`, freezes the request,
  and binds its hash to that ID. Same request replays the existing pending/completed
  result; different request returns 409 `execution-id-conflict`. GET is
  `/results/:id`. Missing returns 404, expired returns 410, capacity returns 503.
  Cache is process-local, expires after 24h by default, has 1024 entries by default,
  and is not durable across restart. Request cap is 8 MiB. There is no artifact
  download route and no bearer authentication implementation in this server.
- `lib/wrapper.mjs` and `lib/contract.mjs`: server transport, domain analysis, and
  artifact completeness are separate. A complete refusal/no-change report can be
  successful delivery. HTTP 200 can also carry `ok:false`, missing outputs, or an
  engine transport failure. Preserve those distinctions in the consumer.
- `lib/input-guard.mjs`: inline JSON text is staged with a final newline appended
  if absent. Receipt `bytes` remains the original text length, while its hash is
  computed from the staged file. D14 already records `sha256` and `stagedSha256`;
  preserve and explain both rather than claiming exact staged byte identity when
  the server normalized a newline. Per-input cap is 1 MiB. Non-JSON strings can
  be interpreted as host paths. Directory/job sibling acquisition needs separate
  handling; do not accidentally send caller paths.
- `lib/receipt.mjs` and `lib/digest.mjs`: verify input names, byte counts, staged
  hashes, aggregate input digest, expected outputs, output metadata and aggregate
  output digest. `digestNamedBytes` sorts names and hashes normalized fields
  `name`, `kind` (default file), `bytes`, `sha256`, with directory path only for
  directories. Output paths are host paths, not client acquisition authority.
- The HTTP body includes an engine result/summary plus receipt metadata. The
  vendor engine's HTTP summary is not the full `budget-impact.json` artifact.
  GET has no general output-byte transport; local readability must not turn into
  a claim of HTTP artifact delivery.
- `lib/funding.mjs` / receipt: funding state and non-live fixture price are
  available, but GET does not echo all caller payment/accepted terms or the
  server's frozen request hash. Do not invent remote cryptographic terms proof.
  Test request substitution using the real same-ID conflict contract and be
  explicit about which response fields the client can actually verify.

## Remaining implementation, in order

Exclusive write paths for all steps: `experiments/wave5/d14/` and
`experiments/codex-window/cw70-cold-http-consumer-current/`. Shared server/routes,
CW60 outbox, and CW64 Python remain read-only. No additional runner, server,
package installation, deploy, spend, signing, or new assignment admission.

1. Repair the existing D14 ticket and CLI. Choose/validate execution ID before
   network I/O. Read caller UTF-8 JSON once, record frozen request bytes and input
   digests, and persist a ticket atomically before POST. Never require the POST
   response to learn the retrieval ID. Preserve useful ticket state on timeout,
   response loss, parse failure and refused connection. Separate definitely
   rejected submission from uncertain commit status. Never silently retry under
   a new ID or imply durable exactly-once recovery across server restarts.
2. Repair origin, retrieval and transport validation in the existing client.
   Restrict retrieval to the ticket's expected origin and `/results/:id`; reject
   unsafe/invalid IDs, foreign origins, userinfo, encoded traversal, query/fragment
   ambiguity and response-controlled redirects. Explicitly disable redirects for
   POST and GET. If adding auth, use runtime-provided dummy auth in tests only,
   never persist secrets or forward them across an origin boundary. Bound timeout
   and body consumption, including response-body timeout, and reject non-JSON.
3. Implement ticket-bound result verification before success classification:
   contract version, executionId, retrieval ID/path, job, funding/declared terms,
   inputs and aggregate digest, known expected output names and metadata,
   outputsDigest, and body/receipt consistency. Pin the original successful POST
   response identity when available. Do not let recomputed hashes on a substituted
   response count as proof of caller identity. Document GET's terms-proof limit.
4. Surface `unsupported-portable-acquisition` when only artifact host paths are
   returned. An HTTP engine summary can be retained as a verified metadata/result
   response, but must not count as acquired artifact files. Implement a thin
   explicit local acquisition option, for example `fetch --local-artifacts DIR
   --acquire-to DIR`, consuming caller-selected copies only. Ignore HTTP `path`
   for file access. Check exact names, completeness, hashes, byte counts,
   containment/symlinks, and atomic destination publication. Mark acquisition
   source as local; `httpArtifactsDelivered` must remain false.
5. Replace `test/spawn-d01.mjs` fallback logic and the old SDS52 suite with cold
   current-runtime tests. Launch the existing archived server entrypoint, not a
   newly implemented server. Sender and fetcher must be separate OS processes
   with independent client working directories and caller files removed/changed
   after freeze. Use Node permission restrictions or equivalent to deny the HTTP
   client access to the host artifact tree, then separately test explicitly
   imported local copies. Use owned ephemeral ports/TMPDIR, one worker, 768 MiB
   heap; no PG/Firebase is required by the inspected HTTP core.
6. Add the acceptance controls below using real HTTP for runtime claims. A test
   fault proxy or executor injection is acceptable only as an explicitly labelled
   fault fixture around the unchanged runtime; it is not positive delivery proof.
   Preserve at least one actual engine result/artifact content oracle. Save
   requests, responses, digests, process separation and cleanup evidence within
   these owned paths. Update old package README/receipts only with truthful new
   scope; retain the archived originals.
7. When implementation and acceptance are complete, record full results and a
   final message, commit only these paths, and update the same draft feature PR.
   Root decides further admissions/integration; do not merge the default branch.

## Acceptance commands and controls

From repository root, the only executed regression command so far was:

```bash
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/codex-window/cw70-cold-http-consumer-current/test/consumer-foundation.test.mjs
```

Actual exit **1**, tests **5**, pass **1**, fail **4**, skipped **0**. The passing
control is nested ECONNREFUSED classification. Failures are incomplete output
accepted as analysis success, loss of caller execution ID, implicit redirect
following, and cross-origin retrieval issued. This suite uses injected fetches;
it proves client gaps, not server or cross-process delivery behavior.

Once the remaining work is implemented, the intended bounded acceptance command
is (not run, not yet expected to pass):

```bash
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/wave5/d14/test/*.test.mjs \
  experiments/codex-window/cw70-cold-http-consumer-current/test/*.test.mjs
```

Do not run that second command unchanged now: historical D14 tests can resolve a
monorepo runtime or fetch an old checkout. Replace that fallback first.

For manual source inspection on a new VM, the committed archive is sufficient:

```bash
cw70_tmp=$(mktemp -d "${TMPDIR:-/tmp}/cw70-inspect-XXXXXX")
tar -xzf experiments/codex-window/cw70-cold-http-consumer-current/evidence/source/runtime-a9aaa0f.tar.gz -C "$cw70_tmp"
# Inspect the unchanged server source under "$cw70_tmp"; do not mutate it.
# After inspection and after stopping any specifically owned child processes:
rm -rf -- "$cw70_tmp"
```

Required controls: real changed-input artifact content; genuine no-change;
complete analysis refusal versus HTTP 200 contract refusal; incomplete/no-output;
response lost only after server commit then fetch from another process without
rerun; invalid ID and valid-but-wrong ID; input/output digest substitution;
job/terms substitution and real 409 conflicts; same/cross-origin redirects with
zero dummy auth/body bytes at sink; header and body timeouts; refused connection;
non-JSON/oversized response; two concurrent clients including one same-ID replay
and one conflicting request; expired/missing/restarted process cache; remote mode
with host artifacts actually inaccessible; local exact-byte success plus corrupt,
missing, stale and symlink artifact rejection. Preserve transport and analysis
classification separately throughout.

## Cleanup and handoff boundary

No runtime or engine children, extract directories, compiler/emulator set, PG,
Firebase namespace or persistent test service was created. Archives were verified
in memory without extraction. Existing unrelated processes and other owners'
work were not touched. No credentials/provider homes were read or changed for
closeout; existing authenticated Git/PR export was used. Stop after export and
readback; implementation is reserved for the next owner.
