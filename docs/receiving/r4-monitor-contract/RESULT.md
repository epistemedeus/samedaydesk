# ROOT4431 / R4-J03 source receiving

Implemented, tested and self-reviewed on the admitted Cursor VM. The writer
branch remains `codex/root4431-monitor-contract-20261023`; canonical origin remains
`https://github.com/epistemedeus/samedaydesk.git`. No sibling implementation,
shared pin, root manifest/lock, provider setting, human asset or archive changed.

Implementation head: `498a18093d78e8e801c334b1b33de1a22583cc27`.
Implementation tree: `870809fd1c4f7ed73616b960987523244cfa6c45`.
Base: `79fbd37d31aabdc790248443c576a2f0017e55f0`, tree
`9e7c8c1bb1f513841117d9d7d3bd5ef49839f501`.
A following receiving commit contains this report and preserves the original
baseline TAP bytes as gzip. Implementation and test source remain identical to
that implementation head. Resolve the final export with `git rev-parse HEAD
HEAD^{tree}` after selecting the admitted branch. Exact frozen operating/research
inputs, receipt hash, declared native Sol6.1/xhigh profile, host and actual SPEC
checkpoint/horizon are in [INPUTS.json](INPUTS.json). No model child was started.

The mounted owner now exposes a distinct machine manifest. `artifact` retains
the original `feature-branch-not-deployed` packaging provenance and its digest.
`runtime.available` means this configured API has freshly checked PostgreSQL
schema readiness and matched local source. `runtime.observationsAvailable` also
requires the existing scheduler to be enabled. A document read never arms it.
`source` explicitly limits its claim to the local monitor runtime and never
asserts a provider build identity or installation qualification. `access` says
operator provisioning, existing tenant credential, unevaluated entitlement,
no guaranteed capacity and three lifetime free slots without renewal.

`GET /api/monitor/openapi.json` serves the exact checked file bytes, with
`application/openapi+json`, a same-origin `/api/monitor` server, SHA256/byte count
in the manifest, and schemas for the mounted status. The manifest advertises
only this supported machine document. Internal README/runbooks and demo commands
are not offered as public acquisition routes. Disabled/unready PG or missing,
stale, linked or inconsistent source yields 503 and no available contract claim.
Source changes during a query and shutdown while a query is blocked cannot keep
a prior ready verdict. Query strings and non-GET document access are refused.

| Executed receiving | Result |
| --- | --- |
| Original exact installed-lineage baseline | 0/2 accepted: healthy PG/scheduler, historical artifact label, and advertised OpenAPI/README401. [Original bytes](baseline.tap.gz) retained; [cold replay](baseline-replay.tap.gz) reproduces both failures |
| Real createSdsApp + disposable verified-TLS PostgreSQL | 11/11 pass, including anonymous exact contract acquisition, response-schema validation, no-effects reads, private entitlement refusals, disabled/invalid/missing PG/config, stale source, real PG stop/start, schema mismatch, await/close fences and cold file/source failures |
| Existing lifecycle regressions | 28/28 pass in the same serial command |
| Focused historical standalone contract | 1/1 pass, no observation run |
| Final serial resources | 776716 KiB sampled peak including admitted native/supervisor trees, test processes and owned PG; 2097152 KiB total reserve; zero model children |

[final.tap](final.tap) contains 39 passes, zero failures/skips.
[standalone-contract.tap](standalone-contract.tap) contains the additional pass.
[RESOURCES.json](RESOURCES.json) states the sampling limits; this is not a claim
that earlier setup or every between-sample peak was measured. The incomplete
first native-tree measurement and every material failed attempt remain in
[ATTEMPTS.md](ATTEMPTS.md). [COMMANDS.md](COMMANDS.md) contains actual commands,
prerequisites, replay instructions and their boundaries.

The receiver seeds only disposable fixture history: four tenants, five
credentials, three already occupied/paused lifetime slots, one finished run,
retained run/snapshot/event bytes, an accepted delivery and its attempt.
Complete pre/post rows remain equal through public acquisition, all refusals,
source/PG recovery and process restart. Reader/owner retained reads still work;
anonymous/revoked/foreign reads refuse, reader writes/polling and expired writes
refuse, and the owner cannot acquire a fourth lifetime slot. No tick or upstream
observation runs; the retained rows are synthetic history, not scheduler output
from this job. Gateway PG health/discovery still report payments disabled and
preserve its tables. No production tenant, grant, monitor, callback or payment
was created, renewed or replayed.

Root's remaining boundary is canonical composition and machine-only release
receiving. [SHARED-PIN-PROPOSAL.json](SHARED-PIN-PROPOSAL.json) gives the exact four
hash refresh/additions needed in Root's existing private-control source pin,
including the new projection module. That shared file is byte-equal to the
admitted predecessor. The tests use a job-local candidate closure and explicitly
refuse the predecessor's stale evidence. A normal combined Root pin regeneration
is supported; tests do not permanently require the real canonical pin to remain
stale. No extra shared port, migration, grant or provider setting is required.

Do not install this branch alone with the predecessor's source pin: it correctly
reports source_unverified. Root must compose the exports, regenerate its combined
canonical closure once, and receive the qualified installed source and unchanged
emitted/hosted human assets using its existing release procedure. Those production
and preservation checks were not run here. No installation, outside useful use,
paid acceptance or revenue is inferred from these source tests.

Next-use on a fresh same-context receiver with Node22, PG16 and OpenSSL:

```sh
NODE_OPTIONS=--max-old-space-size=512 npm ci --ignore-scripts --no-audit --no-fund
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  server/lib/machine-services/test/monitor-manifest-journey.test.mjs \
  server/lib/machine-services/test/lifecycle.test.mjs
```

The fixture creates and tears down its own TLS PG, mounted HTTP listeners and
candidate source evidence. `bash docs/receiving/r4-monitor-contract/replay-baseline.sh`
repeats the historical failure on the exact predecessor in scratch and is
expected to exit1. It does not switch the writer branch. After Root's eventual
qualified release, a cold reader fetches `/api/monitor/v1/manifest`, holds unless
the required runtime/observation status is available, follows its `openapi` URL,
and verifies the exact response digest/length. Reading that contract grants no
private entitlement; retain the operator's existing authority and capacity.
