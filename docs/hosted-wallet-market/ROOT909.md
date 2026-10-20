# ROOT909: receive a host change without repricing or losing debt

The owning producer repairs both the package-only graph and SQL identity.
Migration 008 adds immutable `source_binding_anchor` and
`source_binding_succession`; the existing enrollment, five legacy edges and
original owner consent stay in place. New nodes are exact package/host pairs.
The reader validates the entire one-chain history, legacy and complete new
observation seals, retained operation acknowledgements and a 64-edge bound.
Known exact pairs remain usable for rollback; unseen hosts require a fresh
original-owner enrollment operation. Tenant, installed store, contracts, chain,
token, RPC origin/endpoint, registry identity and profile remain exact.

The maintained SDS native-debt reader is the starting consumer. Its ROOT525
recursive closure/lock hashing, safe file access, timestamped preservation and
legacy chain corrections are also reconciled into the scoped Pilot producer.
The producer's export copies only four owned source/migration files, verifies
predecessors and records exact per-file provenance. The normal SDS receiving
exporter now adds new package members to the host closure. No unrelated
package file or version changes merely to manufacture a new source hash.

Source inputs are SDS `7a7916eed64d37f13f2c2cdec1e90275be99620b`,
original Pilot `f764645e13771dcf79c5172b8397bb35417de98e`, adopted Pilot
`f4dcfa92f169ec367d98a8010d411b37e3c87e9a`, metadata candidate
`0b14ec03d3a45f2669eb7a0024ad86ca43ed68eb`, current toolkit
`f7e9a96e051e349f78820fe4065372d1da0d73aa` and unchanged Neo
`6c0836416b800d32eb4374681a2e44fe3fbd54ee`. The metadata candidate has no
root71 source path and is retained as provenance, never used as an older
consumer replacement. No public-main merge is part of this source batch.

The 443-file journey manifest, all 45 desk members and their manifest, host and
wallet dependency locks, human assets, frozen terms, original actors/grants and
archival owed states stay unchanged. `sourceBinding` is an owner readback of
stored accepted identity; it is not a request field or financial authority.
New paid-observation seals cover all columns and retain UTC microseconds.
Enrollment and imports serialize on the projection lock and take database time
after acquiring it, so a later import cannot fall behind a newly stored seal.

## Root installation and receive recipe (not executed here)

Use the normal existing release and source-qualification route with these exact
feature inputs; retain its old qualification/build/rollback records. Keep the
original credentials, environment, installation, store/schema, registry and all
stable profile values. Receive the unchanged Neo/desk manifests, lock and human
bytes before application. Do not regenerate accounts, terms, grants or funding.
The source receipt gives exact commit/tree identities and preservation hashes.

On the qualified candidate, using Root's existing private environment:

```sh
root909_admin=vendor/hosted-wallet-market/bin/installed-debt.mjs
node "$root909_admin" inspect
node "$root909_admin" migrate
node "$root909_admin" inspect
node "$root909_admin" enrollment
```

`migrate` applies existing additive migrations and 008 in one transaction. It
does not rewrite enrollment, edges, obligations, paid observations or original
consent. Do not run `seal` to replace missing authority. An existing missing
obligation guard or original owner consent is a hold requiring investigation.
Receive the same historical rows and original archival owed state before and
after this migration and the normal candidate installation.

Root then submits one fresh empty-body operation through the existing installed
authenticated owner endpoint. Do not reuse the earlier unknown operation for a
new source transition, invent a successful response, or replay enrollment merely
to diagnose the old empty 409 response:

```sh
node "$root909_admin" enroll --operation ROOT_OWNED_FRESH_OPERATION
node "$root909_admin" enrollment
node "$root909_admin" disposition --obligation ORIGINAL_ALREADY_PAID_OBLIGATION
```

For a newly submitted operation whose response is lost, preserve its exact key.
First read enrollment and the original stored operation/disposition using Root's
existing readback route. The same key/body returns the stored response; a stale
cached result still must pass current graph, consent and installation checks.
Verify `qualified:true`, the expected exact `sourceBinding`, unchanged original
enrollment fields, unchanged five legacy edges, one new pair edge, and the
original paid obligation's `payable:false`, `newPayable:false` and exact transfer.
Do not treat this source fixture result as proof that the hosted installation
has changed. Unknown production operations remain Root-owned.

After that receiving, use the current original-claim toolkit and its original
private inputs/journal to record the already accepted VYTREL report, quality
verdict, acceptance and original obligation export. The report was accepted at
0.01 under its original account/claim/terms. No new task, signup, terms,
clarification, work or award is requested. Root alone owns the actual sender
and payment; it receives the original exclusive discharge through
`original-claim.mjs discharge`. Keep the other original slot unused. The exact
current toolkit README supplies that original-path sequence. A consumed or
pending registry proof never creates another payable.

## Rollback

Disable/roll back the adapter through the existing release route, keeping the
database, all schemas, guards, consent, idempotency receipts, legacy and pair
edges and registry. The diagnostic command is read-only:

```sh
node "$root909_admin" rollback-check
```

Never use disposable teardown or drop migration 008 on a real installation.
Restore an exact previously accepted package/host pair. Native paid readback
must stay nonpayable even while the adapter is disabled or source is stale.
Forward restore to the tested candidate reuses its accepted pair and adds no
reverse edge. Old binaries do not understand the new graph; use them only for
an exact retained rollback pair, not for enrolling another new source. A later
legacy-edge mutation after the anchored history is a hold, not a reset recipe.

## Receiving and retained observations

Exact f7e9a96e's six suites passed 12 tests, exit 0, no skips on the initial clean
candidate. Its unchanged final-receiving control reported 50 passes/3 failures
(53 including parent tests): both failed subtests counted only the legacy table.
The amended control requires zero rewritten legacy edges and exactly one new
pair edge, retaining all original row/paid/owed checks. The owning original-claim
control also receives a five-edge host-only succession before its one exclusive
discharge. A separate PostgreSQL/HTTPS suite checks all synthetic business rows,
lost response, concurrent requests, exact retries, all source-change forms,
wrong authority/bindings, missing/tampered seals, cycles, branches, 64/65 bound,
rollback and durable nonpayability. Final commands/exits/heads/TAP are in the
ROOT909 receiving export.

The initial uncommitted-candidate refusal (`exact_clean_sds_required`) and the
fixture SQL/timestamp-restoration failures are retained there. Ordinary fixture
failures were repaired without relaxing product contracts. The supplied real
observation remains: one owner attempt returned empty 409, the later GET returned
914-byte JSON and 67 business tables/351 rows were unchanged. This work neither
replays that operation nor assigns an invented cause to its empty response.
