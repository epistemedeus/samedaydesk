# VF09 completed receiving result

Implemented and tested on the same receiving branch after the completed lifecycle
work. Tested implementation: **`0ea0252c31ed28909e39b4dea6cd30b17856fff5`**.
The final documentation/export tip is recorded in
`.scratch/vf09-export/export-receipt.json`; subsequent documentation changes do
not alter that tested runtime. Source remains on
`codex/visitor-foundry-integration-20260926`. No main merge, deployment, public
release, production migration, new login, paid resource or subordinate worker.

The actual VF05 client now drives the existing VF02/VF04 PG transaction boundary.
A builds the received VF08 C source into Wasm, executes its original task locally,
and submits the reusable component through durable create/claim/checkpoint/submit.
A host-owned evaluator checks four separately frozen later cases. The native
limitation-review gate is retained with an explicit finite installed scope review.
After host SIGKILL/restart, four fresh B CLI processes discover and execute the
stored component using only their own task and normal access. They receive no
candidate ID or A transcript. Exact-input evidence limits reuse: a new unverified
input remains unavailable. This is executed owner QA, not an open network.

Read the detailed [Heavy hosting handoff](VF09-HEAVY-RECEIVING-PLAN.md),
[receiving port contract](compound/ports.json), and
[commands/client usage](compound/README.md).

## Exact terminal sources

| Input | Exact terminal export | Receiving action |
| --- | --- | --- |
| VF04A lifecycle | `ca638c7ef552ebb1c55cce77f13e1c7162a29fbb` | Same branch parent; all F93/lifecycle source preserved |
| VF05 participation | `6324f34e2bab109b5babee7ceb9e147f114719ba` | Received owned subtree, then minimal F93 client/fixture correction |
| VF08 execution | `f489aca31b6670f8e4c7e3b0b73db19dede670ed` | Received owned subtree; trusted F93 adapter and durable sample callbacks |
| VF06 composition | `69619166a105c6e2c0153f9082b900a9177d8431` | Exact Git export/RESULT/Heavy review only; not imported |
| VF07 allocation | `b10a1720a93a3414f4ec122c64a5bc2448b3392f` | Exact Git export/RESULT/Heavy review only; not imported |

These supersede stale pins in the assignment. All came from exact Git exports,
never another worker's checkout. The one-component useful task did not justify
manufactured composition or matching. F93's complete 512-unit coordinates,
100-dependency wire domain, exact native aliases, distinct gap schemas and
non-replayed environment evidence remain authoritative. Dependency-bearing
portable components explicitly return unsupported with the original full identity;
they are not truncated into fake executability.

Import/freeze checkpoint `581470574579fc2c627227821a42e8b518ce16bb` committed the
independent Python oracle and four later cases before candidate creation. Their
byte hashes are in [launch-receipt.json](compound/launch-receipt.json). The visitor
CLI receives evaluator metadata, not host cases or expected outputs. This is not
an adversarial blinded trial: this owner controlled both the receiving exercise
and clients. The portable C example was reused from VF08, not invented anew here.

## Demonstrated versus remaining

| Boundary | Demonstrated in this source | Remaining / limit |
| --- | --- | --- |
| Participation | Real VF05 sealed intents → HTTP → canonical PG cells; explicit standing scope; no required human click | Synthetic owner-QA permission only; real-data scope policy needs hosting work |
| Executable contribution | Actual C compilation, module upload, private A execution, installed assigned four-case verification | Source digest is not independently reproduced build attestation or rights adjudication |
| Cold reuse | Four fresh B processes after host restart, normal task/access only, exact outputs | One useful observed-payload outcome; error/unknown/unsupported preserve uncertainty |
| Durable transactions | Current terms/grants, same-transaction submit/admission, duplicate proposal coalescing, checkpoint retention | Client origin/key/grant changes need a new authorized continuation, not old intent forgery |
| Execution recovery | Real child identities/exits, planned/identity/sample crash points, complete-witness reconstruction, no-launch invocation recovery | Claimed execution without exit witness stays physically reserved |
| Lifecycle | Real expiry, concurrent explicit renewal to generation 2, same artifact, old receipt refusal, failed/unknown charges, withdrawal | Four receiver generations and finite lifetime caps; no automatic budget refill |
| Evidence | Four exact-input observations, full runtime bindings, native budgeted machine scope review, native reuse accounting | No whole-domain qualification, promotion, independent organization, real spend or token savings |
| Ordinary behavior | Unnegotiated use, decline, unsupported needs, accepted artifact with zero invocations in the test window | Zero recorded use in that finite window is not a future demand estimate |
| Read path | Growing inventory, mixed real publication/HTTP invoke, lock-wait witness and a measured local improvement | Full snapshot reconstruction still grows; no second index service |
| Hosting | Existing opt-in mount/lifecycle hooks, additive migration004, actual remote private service execution | Actual-host mount and public entry are not implemented/deployed here; Heavy current-host note is still missing |

## Concrete durable changes

The receiver stores bounded immutable proposal/component bytes within the existing
PG host because correspondence's original artifact records contain references,
not executable bytes. There is no duplicate capability registry, lease engine,
queue, validation coordinator, earned-work ledger or payment rail. Migration004
adds that table and per-child/invocation fields; down refuses to erase portable
history. The prior migration003 guard still protects all maintained generations.

The trusted optional PG client parameter on VF02 mutate lets current terms,
leases, checkpoint/submission, native admission and idempotent receipt commit
atomically. Public callers cannot supply a transaction or authority handle.
A 4,096-key HTTP journal cap is enforced transactionally alongside existing
native/maintenance bounds. Package storage is capped at 256/project; source,
module, input and output bytes have explicit bounds.

Every verifier child is planned durably, its process identity commits before
input release, and its actual result/exit is retained. Publication writes four
exact input-digest observations. A separate owner-controlled installed machine
reviewer executes VF03's actual review transition after checking those results;
64 reviews/64,000 declared review-ms are finite and never refunded. Contributor
claims or supplied test text grant no acceptance authority.

Portable invocation uses a durable request/grant/manifest binding and the same
one-physical-slot pool gate as validation. Result and exit witness commit together,
then current authority/evidence is rechecked before output or replay. Lost ACKs
never create a second invocation. An unclaimed reservation can be closed with
actual durable no-launch proof without refund; an already claimed unknown cannot.
Raw unshared invocation request bytes are not stored: the manifest/request and
input digests bind replay while the actual output is retained. Explicitly cleared
contribution reproducers remain shared proposal data. Four recorded verifier exits can reconstruct the same receipt after crash, using
the original observation timestamp. Partial records remain unknown and charged.

## Executed evidence and measured effort

[verification.json](evidence/compound/verification.json) records commands,
source hashes, test counts and receipt hashes. **306 tests passed, zero skipped**
in the final affected suite set:

| Suite | Passed |
| --- | ---: |
| VF09 real PG/HTTP/CLI/Wasmtime journey and races | 14 |
| Existing integration and durable lifecycle | 29 |
| F93 wire conformance | 6 |
| VF01 capabilities | 50 |
| VF02 real PostgreSQL | 15 |
| VF03 native validation/reuse | 65 |
| Correspondence real PostgreSQL | 53 |
| VF05 participation | 46 |
| VF05 real PostgreSQL | 3 |
| VF08 execution | 25 |

Correspondence TypeScript build, the 81-page site build, wire/schema export checks
and independent oracle replay pass. The before/after read benchmarks separately
pass. Existing foundation/F93/lifecycle and received source receipts remain intact;
new replay output is isolated under `evidence/compound/`.

The complete [journey receipt](evidence/compound/journey.json) includes A's build
and private output, all four durable verifier observations/exit witnesses, native
receipt, each B task/result and invocation observation. The exact module is
3,356 bytes; source is 2,456 bytes. A performs 15 JSON requests, sending 13,211
JSON-body bytes and receiving 14,653; this excludes HTTP/TLS framing and local
compilation. The final run's A path takes about 545ms, before hosted verification.
Verifier receipt usage is 259ms CPU / 320ms summed child wall; four native compile
samples are about 5.70–5.85ms each. Each B path takes about 554–579ms and two HTTP
requests. These measurements include local process and host overhead as indicated;
actual currency spend, model tokens and counterfactual savings remain unknown.

The useful result preserves the structured project payload and removes redundant
text. The other three preserve a lost-write acknowledgement as unknown, a denial
as error, and prose-only claims as unsupported. Separate native observation tests
record exactly one useful and three unknown-usefulness owner-QA outcomes; foreign
beneficiaries cannot report them. No independently useful customer task is claimed.

## Read experiment and improvement

Eight HTTP resolve/invoke pairs run at each size with a real component publication
concurrent with reads. The first candidate plus four additional candidate versions
were admitted on genuine misses before any qualification existed. Unrelated
version rows are explicitly trusted load fixtures, not manufactured contributions.
A separate 60ms writer hold is observed in PostgreSQL `wait_event_type=Lock`.

| Unrelated inventory / actual publications | Median resolve before → after (ms) | Median invoke before → after (ms) |
| --- | ---: | ---: |
| 0 / 2 | 66.8 → 47.4 | 592.2 → 500.6 |
| 32 / 3 | 100.2 → 47.6 | 802.6 → 496.7 |
| 128 / 4 | 155.0 → 64.9 | 1,051.3 → 604.1 |
| 512 / 5 | 249.5 → 126.1 | 1,611.3 → 1,010.6 |

The improvement checks each exact installed profile/config once within a graph
read, retaining fresh byte validation on every later read and physical launch.
At the largest size profile-check median drops 133.1→30.4ms; immutable snapshot
building is 80.5→80.3ms and publication journal replay 5.54→5.84ms. Read/invoke
itself does not replay the native journal; publication/maintenance does. SQL data
loading and alias checks are outside the synchronous graph/replay timings.
Lock-query timing includes roundtrip plus row-lock wait; it is not a pure wait
counter. These short loopback samples show a practical local improvement, not a
production throughput guarantee. [Raw and summarized measurements](evidence/compound/read-bench-summary.json)
preserve every result; the Heavy plan specifies conservative future projection
completeness/invalidation requirements if actual-host measurements justify it.

## Defects encountered and resolved

Early compound runs exposed source-revision encoding, frozen descriptor mutation,
a stale native policy field and PG array serialization defects. All are corrected.
VF03 correctly demanded review for declared limitations; the receiver now performs
the actual finite installed scope review instead of stripping limitations or
weakening the gate. One test incorrectly expected 200 for the existing 204 grant
revocation response; the assertion was fixed. VF05's legacy direct fixture and CLI
used the old gap revision field; all now match F93 and both client suites pass.
The VF05 package test also assumed a repository-root cwd; its CLI path now resolves
from its module location.

Initial benchmark failures revealed an invalid hyphenated test schema and an
incorrect assumption that an unseen input after narrow qualification is always a
genuine miss. The harness now admits real proposals before publication and leaves
unknown coverage honest. One after run overlapped the deliberate runtime-drift
test in the same checkout and correctly refused execution; the isolated run passes.
All raw failed receipts are retained, including their original whitespace. Source
diff checks exclude raw evidence and pass.

Final source review additionally found and repaired a hot oracle/corpus/port drift
gap in the profile pin and unnecessary retention of raw invocation requests.
Expanded drift tests verify that changing installed oracle, corpus, evaluator port
or runtime wrapper immediately blocks readiness/discovery/invocation; input-at-rest
assertions verify digest-only request binding with the actual output preserved.

## Heavy handoff and export

The [detailed Heavy plan](VF09-HEAVY-RECEIVING-PLAN.md) gives exact host mount,
migration/readiness, profile installation, worker scheduling, shutdown/recovery,
rollback, public-entry adapter specification and acceptance checks. The separate
current-host note referenced by Root's assignment was not supplied and has been
requested. This result does not invent deployed runtime facts from DEPLOY.md.
Public onboarding remains a specified follow-up: existing project creation is
admin-only and writer grants owner-issued.

The final `.scratch/vf09-export/` contains source bundle/archive, full and
lifecycle-parent patches, detailed Heavy handoff, ports, exact terminal input
heads, test receipts, hashes and verification of the remote tip. Prior exports
remain unchanged. Only this receiving branch is pushed; optional worker branches,
main, production and site identities are preserved.
