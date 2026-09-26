# VF01 result — versioned capability/compatibility foundation

Implemented the source foundation and cold CLI, with immutable manifest identity,
scoped evidence, genuine gaps, exact dependency propagation and explicit sibling
contracts. This is executable code, tests and examples; hosted receiving work is
specified in [HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md).

## Source, execution and ownership

- Repository: `epistemedeus/neomorphic-io`.
- Base pin: `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`.
- Assigned/export branch: `codex/visitor-capability-graph-20260926`.
- Implementation checkpoint before broad tests/build:
  `aab6e56fe16e7b41b6b843301f17a2054297bd54`.
- Native Astra, directly launched by Root, on the assigned Cursor VM checkout
  `/tmp/pilot-visitor-foundry-20260926/VF01/repo`; Node `v22.22.2`, npm `10.9.7`.
  No subordinate model workers, new login, public release or deployment.
- All committed changes are inside `scripts/visitor-foundry/capabilities/`.
  Shared control references were read-only. Sibling VF02/VF03 paths, public routes,
  homepage source, provider/payment flows and other VM jobs were not modified.
- Existing authorized GitHub account was verified as `epistemedeus`, ID 124947147.
  This fresh checkout lacked author identity; only local Git name/noreply email
  were set to match that account and base author. No global auth/config changes.
- [CHECKPOINTS.md](CHECKPOINTS.md) records the source/reuse decision and checkpoints
  before regression setup and tests. Final export receipt/patch are under
  `evidence/tmp/` and the final Root response gives the exact pushed tip.

## Existing source reused; missing delta implemented

Imported S04's `validateCapability`, `inputsCompatible`, `discloseCapability`
from `scripts/scale-lab/capability-market`. Read matching, correction, catalog,
local adapter and journey semantics before adding the version/evidence layer.
No competing catalog/database/framework. Existing record identity is preserved
as a reversible namespace qualification and full original provenance.

Imported preflight's `classifyEvidenceTrust`, `classifyCostLanes` and, in the
held-out executable example, `satisfiesEnginesNode`. Package identity remains
`npm:s180-capability-consumer-kit` at its full source pin. MIT scope is the
preflight SAMPLE allowlist; no website-wide relicensing is inferred. The source
notice retains Pilot pin `dc72cf6420766a55495f016c5e1d49612c4a6b4b` and imported
archive digest `549bbeaa1ba48e1a1c5b6d121e985a1d807b5dadd1be59cca1c2c9834711220a`.

The new delta is content-hashed immutable versions, bounded canonical snapshots,
compare-and-swap/idempotent append, scoped admitted observations, correction and
retraction streams, exact lifecycle/dependency propagation, four-state typed
resolution, stable bounded cursor pages, permission-cleared Gap export and exact
verification-target export. Unknown evidence is never treated as incompatibility
or a genuine miss. Compatibility stays separate from acceptance, actionability,
invocation, actual usefulness and payment.

## Module API and contracts

Import `./src/index.mjs`; see [CONTRACTS.md](CONTRACTS.md) for field-level contracts
and trust/persistence boundaries. All cross-module IDs follow
`neomorphic.foundry.<type>.v1`.

| Export | Purpose |
| --- | --- |
| `createVersion`, `validateVersion`, `refOf` | Immutable typed manifest and exact reference |
| `validateObservation`, `validateMutation`, `validateRequest`, `validateShape`, `checkShape` | Bounded executable input contracts |
| `createSnapshot`, `readSnapshot`, `appendSnapshot` | Canonical projection, digest validation and expected-snapshot revision contract |
| `resolve`, `resolvePage`, `listVersions` | Four verdicts, full-result selection, page size 1..100 and pinned cursors |
| `dependencyImpact` | Exact reverse-dependent closure without unrelated-version invalidation |
| `verificationTarget` | Source/contract/dependency pin for independent assignment; proposals stay data |
| `createGap` | Complete-scope miss/incompatible-only export with cleared reproducer and funding reference |
| `admissionPolicy` | Validate host-owned admitted observation IDs; default trusts none |
| `adaptS04`, `adaptPackage`, `adaptPreflight` | Existing-source adapters retaining provenance and trust/cost distinctions |
| `SCHEMAS`, `LIMITS`, `hash`, `stableJSON`, `versionKey` | Shared constants, identities and canonical encoding |

VF02 seam: `gap` envelope with immutable `contentId`, revision 1, resolver snapshot,
policy/clock, candidate failures, cleared reproducer reference, explicit funding.
VF03 seam: `verification-target` and exact observation target/scope/receipt; the
host constructs admission policy from authenticated VF03 decisions. No supplied
passing-looking receipt can admit itself via the public request contract.

The in-memory projection does not authenticate contributors, persist across
processes or promote registry entries. Hosted authority must protect manifests,
rights/coverage, mutation writes and the admitted-ID policy. Full-contract
positive scope (`inputDigest:null`) is an explicit evaluator assertion, not a
fact inferred from one passing sample. Sibling adapters must preserve that limit.

## Executable acceptance receipt

Run from repository root:

```sh
node scripts/visitor-foundry/capabilities/src/cli.mjs demo
node scripts/visitor-foundry/capabilities/src/cli.mjs holdouts
node scripts/visitor-foundry/capabilities/examples/export.mjs
```

The last command writes six JSON vectors to `evidence/wire/`: snapshot, request,
policy, resolution, gap and verification target. The complete cold import command
was executed successfully:

```sh
node scripts/visitor-foundry/capabilities/src/cli.mjs resolve --snapshot scripts/visitor-foundry/capabilities/evidence/wire/snapshot.json --request scripts/visitor-foundry/capabilities/evidence/wire/request.json --policy scripts/visitor-foundry/capabilities/evidence/wire/policy.json --now 2026-09-26T12:00:00.000Z --limit 1
```

Recorded output: `evidence/cold-resolution.json`. Without `--policy`, the same
inventory resolves unknown (also tested in a fresh process).

| Required case | Actual behavior/evidence |
| --- | --- |
| Compatible reuse | Exact pinned preflight package resolves; held-out runner invokes its repository-owned engine probe |
| Genuine miss | Complete declared scope with zero candidates -> `missing`; voluntary Gap contains references/digests, no raw private input |
| Unknown environment | Missing/unobserved environment -> `unknown`; explicitly unsupported environment is incompatible |
| Conflicting/expired evidence | Opposing admitted evidence -> unknown; expiry is excluded at exact boundary and remains auditable |
| Revoked dependency | Definite incompatibility propagates through exact transitive dependency pins |
| Correction/retraction | Revisioned append changes current evidence without rewriting history or widening scope |
| Unrelated preservation | Other version/dependency/environment remains usable; new dependency pin needs new parent evidence |
| Dependency evidence change | New negative, expiry or withdrawal makes old composition receipts stale; later admitted composition replay can restore usability |
| Pagination/dedup | 137-version test, shuffled/duplicate pages, limits 1/7/100: same aggregate result, selection and resolution ID |
| Adversarial input | Prototypes/accessors/cycles/functions, malformed IDs/dates/types, unsupported constraints, forged policy fields, changed bytes, revision forks, huge error sets and shared DAG expansion rejected/bounded |

`evidence/demo.json` retains the full deterministic journey. All demonstration
participants, admission and fixtures are owner-controlled and labelled synthetic.
No contributed test proposal, manifest script or arbitrary artifact was executed.

## Actual validation on this VM

All test temp directories were routed into the owned `evidence/tmp/`. Root npm
installation used a repo-local cache. Original failed runs were retained rather
than overwritten; full explanations are in [evidence/FAILURES.md](evidence/FAILURES.md).

| Actual command | Final result | Evidence |
| --- | --- | --- |
| `node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs` | 50 pass, 0 fail, 0 skip | `evidence/focused-final.tap` |
| `npm ci --ignore-scripts --no-audit --no-fund` | Exit 0; 206 existing lockfile packages installed | `evidence/npm-ci.log` |
| `npm run build` | Exit 0; task-memory compiled, 81 pages built; no deployment | `evidence/build.log` |
| `npm run test:capability-market` | 26 pass, 0 fail | `evidence/s04-rerun.tap` |
| `npm test --prefix packs/capability-preflight` | 35 pass, 0 fail | `evidence/preflight-rerun.tap` |
| `npm run test:scale-compose` | 9 pass, 0 fail | `evidence/composition-rerun.tap` |
| `node --test --test-concurrency=1 tests/capability-preflight*.test.mjs` | 11 pass, 1 fail (browser launch) | `evidence/preflight-public-rerun.tap` |
| `NEO_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable node --test tests/capability-preflight-layout.test.mjs` | Same browser launch SIGTRAP, before assertions | `evidence/preflight-layout-direct.tap` |
| `node scripts/visitor-foundry/capabilities/src/cli.mjs demo` | Exit 0 | `evidence/demo.json` |
| `node scripts/visitor-foundry/capabilities/src/cli.mjs holdouts` | Exit 0 | `evidence/holdouts.json` |
| `git diff --check` | Clean | Final export verification |

Initial owned defect: two tests exposed opaque S04 object adaptation; fixed and
41/41 rerun recorded before later coverage expanded to 50. Initial existing
suite failures came from missing build prerequisites and a source-pack/public
repack collision in our parallel orchestration. Setup/build and sequential
pack rerun resolved those. Remaining failure is environment-only Chrome launch;
no browser/page correctness claim is made from that failed check. No PG test is
claimed: VF01 changes no service/database source; PG receiving tests are explicitly
specified for Heavy rather than starting/restarting shared VM services.

## Held-out measurement, with limits

`examples/holdouts.json` has six later synthetic tasks; its digest is
`sha256:638888e950efd04e0b1945cc51931689456a38690017ee880b7727e5e57d19f0`.
The inventory/policy is frozen before loading holdouts. A deliberately limited
major-only no-network baseline succeeds on 4/6; reuse of the actual preflight
probe succeeds on 6/6, adding the two minor-version cases. Output correctness
includes honest unknowns for unsupported range grammars. Each observation binds
a distinct later task and exact package version.

This demonstrates how to count later tasks helped by coverage. It is not a blind
benchmark or model uplift study, and does not establish external demand, economic
savings or faster execution. Local timings include resolver overhead; adaptation,
sharing, verification and maintenance effort/cost remain unmeasured/null.
Relationships are explicitly owner-controlled/not-independent. VF03 owns later
cohort accounting and authoritative receipt admission.

## Exact next Heavy work

Follow the seven staged deliverables in [HEAVY-RECEIVING-PLAN.md](HEAVY-RECEIVING-PLAN.md):
receive and reconcile sibling contracts; materialize the existing S04/package
inventory; persist artifact references and derived indexes through correspondence
and VF02 transactions; authenticate VF03 admission; connect existing discovery to
optional voluntary cells; execute a cold two-visitor receiving journey; run real
PG/restart/backpressure and remote review before the existing host release process.

The plan names current source/API/store/migration seams, concrete keys and CAS
rules, tenant/cursor/expiry behavior, integration tests, source/rights preservation,
rollout flag, metrics and rollback. Snapshot materialization is bounded and in
memory today; durable projection/cache, authenticated hosted handlers and independent
verification/promotion remain receiving work. No new registry, earned-work ledger,
provider signup, payment rail or universal execution sandbox is proposed.
