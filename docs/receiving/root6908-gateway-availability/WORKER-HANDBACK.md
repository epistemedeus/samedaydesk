# ROOT6908 handback

Received the previously unconsumed merchant-restoration handoff through the
existing validated `--receive` producer. No availability algorithm or merchant
feature was needed. The producer owns the guide block/descriptor; its existing
reader also supplies skill, OpenAPI, catalog, agent card and the task router.
The owning workflow now requires that complete consumer handoff. Regressions
follow received state instead of pinning the October22 pause.

## Exact source and inputs

- Canonical origin: `https://github.com/epistemedeus/samedaydesk.git`.
- Preserved writer: `codex/root6908-gateway-availability-20261024`.
- Base: `d310f4cf37fb190d850ac0cea71ec34787972162`, tree
  `8b79c1d8586c630f90a5241f52ce969fda641466`.
- Final tested product source: `46a217f9665d004dd28a3b9000e36d6e72c83bcf`, tree
  `dc035f6f70d8a0294fea2c4e4c149325d22fff70`, one direct child of that base.
  The subsequent export commit adds only this receiving directory. Exact final
  export HEAD/tree, remote readback and bundle digest are recorded after commit
  in task-root `WORKER-EXPORT.json`; they cannot self-reference this document.
- Product paths: `server/config/paid-gateway-availability.json`,
  `client/public/discovery/paid-gateway.json`, `client/public/llms.txt`,
  `server/scripts/test-gateway-availability.js`,
  `server/scripts/test-machine-discovery-journey.js`,
  `tools/offer-routing/route-job.test.mjs`,
  `server/scripts/GATEWAY-AVAILABILITY.md`.
  `CHANGED-PATHS.json` lists every product and evidence path.
- Complete frozen instructions/STATE/plan/assignment read and their supplied
  hashes/blobs verified. Receipt SHA256 is
  `e42b8dfa8a59757e1e6c7997702fbeb4d60b7ac4755edeca96c2934d4207a915`.
  `INPUT-PROVENANCE.json` binds them and both complete GH-fetched Pilot inputs at
  `0a5ebf5c93c32927a64fe4146c6848e1bf48c3c7`. Their remote paths are source
  provenance, not product-relative verification inputs. Original6884's complete
  result is retained separately at its exact `65f80a5a...` publication.

`RECEIVED-STATE.json` preserves the complete exact input. Its bound copy changes
only `received.receipt` to immutable Pilot URLs; config equals that bound copy.
Observation remains **2026-10-24T23:56:22.400Z**. Configured merchant is exact
`e291d41c1f1763e638e2812568290ed176a31c49` / SUCCESS
`20aeb195-f95d-4e20-85f5-9edb4e181bd7`, with all five predicates true.
No newer observation or expiry policy is invented. The expired authorization's
active absence is valid under installed semantics; its unchanged archived454B
unknown remains unresolved. Nothing was recreated, reinserted, paid or replayed.

## Executed checks and raw receiving

`CHECKS.json`, command receipts and full TAP logs retain actual commands/exits;
`TEST-CASE-IDENTITIES.json` retains exact identities for every run.

- Node22.23.3/npm10.9.9. Reused task-local copies of the existing root5240 locked
  dependencies after both lockfiles compared equal; no install or lock change.
- Baseline normal build `npm --prefix client run build`: exit0. Baseline serial
  seven-file related run: 41 reported tests, all pass, zero skips.
- First amended gateway-only run:16 reported tests, all pass, zero skips.
- Actual `node server/scripts/project-gateway-availability.js --receive
  docs/receiving/root6908-gateway-availability/RECEIVED-STATE.bound.json`: exit0.
- Final normal build and exact committed-source normal build: exit0. Full serial
  seven-file focused/related runs, including exact source46a217f9:49 reported
  tests each, all pass, zero fail/cancel/skip/todo. These are48 leaf identities
  plus the transition parent. This is not a whole-suite claim.
- The new seven-case transition group exercises all six machine routes and
  router: available→paused, stale restoration refusal, health200/challenge402
  with each predicate false, fresh restoration, missing/invalid config with
  fail-closed reprojection and recovery, explicit unknown. Existing missing-field,
  malformed/time/evidence refusal and offline-preservation cases remain.
- Two complete352-file normal emissions are retained as raw bytes. Comparison
  finds only `discovery/paid-gateway.json` and `llms.txt` changed; **350 files,
  all139 emitted human HTML and all40 assets are byte-equal**, without
  normalization. Guide bytes outside its owning block are equal. Human
  templates were not used as a proxy. No consumer partition was needed.
- Actual local production app GETs captured all six machine responses, before
  and after: descriptor, llms, dynamic skill, OpenAPI, catalog and agent card.
  All return200 with machine media types and the expected received state.
  Raw bodies/metadata are under `before/` and `after/`; hashes and JSON change
  paths are retained. The router selects the existing paid offer while
  `executionAuthorized:false`; no request is performed.
- `compare.py`, committed-output comparison, input binding, syntax checks and
  `git diff --check` pass. Source self-review caught and removed an accidental
  edit inside a test's child-process import string before committing/testing.
  Availability library/projector, package manifests and both locks remain exact
  base bytes. All other source/archives/financial/contributor state is outside
  the seven-path product diff, not a claimed financial-store audit.

## First failures and resource limits

The optional `/usr/bin/time -v` build attempt exited127 before invoking npm;
its original stderr is retained. The replacement Python sampler records actual
command exits. No product test failed. The original baseline fixture overrode
its child's heap cap to1280MiB; that existing exception is recorded, not hidden.
The owning amendment caps it at768MiB. Final build/test descendants use768MiB
Node heaps and UV/OMP1, with serial execution and Rayon1.

Declared native profile is gpt-6.1-sol/high, one parent/zero model children,
**3,145,728KiB TOTAL**, not extra per-child memory. Actual committed build's
50ms sampled aggregate includes the verified own native supervisor tree and
build descendants: **746,632KiB**; final related test aggregate:635,340KiB.
This is sampled RSS, not an enforced hard cap or a proof about between-sample
peaks. No other job was owned, inspected for cleanup or signalled. Completed-turn
native metadata/lifecycle is separately received by the controller.

## Export, release and cleanup

`RAW-EXPORT.json` binds the92,596,761-byte raw pair archive in this job's
`qualification/EMITTED-PAIR.tar.gz`, SHA256
`b5f331976eab248b0d9ac3bbfeeb42c9d4a0e36d3f2a654a3406cf569e9d0167`.
All704 archived file bodies were read back equal to the original snapshots
before task-owned scratch/dependency/build copies were removed. Raw machine
bodies and all emitted-file manifests also travel in Git.
`RELEASE-AND-ROLLBACK.md` supplies exact source integration, existing controller
arguments, new-operation rollback and six-route hosted readback commands.
`hosted-readback.mjs` was syntax-checked; no hosted request was executed.

`CLEANUP.json` records removed task-only paths, zero background jobs/model
children/browser tabs and no remaining test fixtures. The first broad rm-style
cleanup command was rejected before execution; explicit ownership-checked Python
cleanup completed instead. Other owners and native supervisor were preserved.

No provider/deployment/DB/environment/account/key/signer/payment/HTTP browser
journey/contact/PR/merge/release or new service was performed. MPP/Vibes-off and
unqualified other services are unchanged. Root owns integration, current private
source/provider receiving, release and hosted human/machine readback. Source,
build and fixture acceptance is **not hosted restoration, customer use or
revenue evidence**. Export is completed before the actual00:26:54.995UTC SPEC
checkpoint and00:41:54.995UTC required-until boundary.
