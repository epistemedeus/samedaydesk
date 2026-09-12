# CW64 installed Python client closeout

Status: **done for the scoped 1.4.1 consumer patch**. No implementation remains
for that pinned consumer scope. Integration of newer engine source and future
Python-entry consolidation are separate owner decisions, not readiness claims
made by this patch. Work executed directly on the enrolled **Grok VM /
node_grok_bot_vm** (hostname `cursor`), not a Cursor Cloud host. No child model,
Cursor inference, nested model CLI, or agent delegation was used.

## Exact inputs and exported paths

- Repository: `epistemedeus/samedaydesk`.
- Exported implementation commit: `dc618933ced736c9d2534222f4a5ad050ea8a9b0`.
- Draft PR: https://github.com/epistemedeus/samedaydesk/pull/142.
- Existing branch: `codex/cw64-installed-client-current-runtime-20260912`.
- Integration base: `76f0fab6250cb8d9aaddaaaa3e4e3373ca2cc5be`.
- Imported only `tools/python-useful-jobs-client/` from completed D08
  `feaa2f8791a693bd9c3ef5211e752307e188b96c`. Exact original blob manifest:
  `evidence/D08-import-source.txt` relative to this handoff directory.
- CW39/PR130 prior evidence, read-only:
  `d92a6201306799e75e1dfada981c87e11f6ea746`,
  `experiments/codex-window/cw06-python-useful-jobs/`. Its wrapper was read but
  neither imported nor edited. Original review is in `evidence/CW39-REVIEW.original.md`.
- Consumer archive: useful-jobs **1.4.1**, 2,575,456 bytes, SHA-256
  `b365d95c8fb7695f96248433a7d440c9917b4d5085b1ce71b3982e4291e1bc3d`.
  Durable archive path:
  `client/public/for-agents/useful-jobs/useful-jobs-1.4.1.tar.gz`.
  Metadata's archive source/freeze: `b046a2074fedfff85ca18aa7ebe9e3d42b87c95e`.
- Exact dependency hashes and environment: `evidence/dependencies.json`.
- At closeout, remote `main` was observed at
  `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`; it was not imported or changed.

The draft is stacked on existing `codex/useful-jobs-core-integration-20260912`,
observed at `30345f69f16aca93bb95511ee4da62975c98cc04` (eight commits ahead of
the requested integration base). Those later source changes were not imported
or tested here. Retargeting from main removed inherited integration history
from the PR diff; readback verified all 44 initial source/evidence files are scoped.

Only the client directory and this experiment directory are changed. Shared
runtime, engines, public archives and unrelated evidence remain untouched.
Everything needed to review/reproduce is in this repository. No dependency on
extractions, venvs, or logs left exclusively in the Grok VM is required.

## Implemented interfaces

Existing package/console script remains `samedaydesk-useful-jobs`; Python package
is `samedaydesk_useful_jobs`, now 1.1.0. Commands remain acquire/catalog/list/help/
run/version. Packaged pins include all ten jobs and their exact output sets.
Explicit archive/origin input works without checkout discovery. File argv is
resolved from the caller directory; duplicate/empty transport options refuse.
Output is staged under a pinned parent descriptor and published through Linux
atomic no-replace rename only after validating the report and artifacts.
Failures return structured refusal with `published:false`; exit 124 from the
engine remains a nonzero engine exit, not a falsely inferred timeout.

The private supervisor uses Linux subreaping and an owner-liveness pipe.
Timeout/normal-exit descendant cleanup is verified even for detached sessions,
and an unrelated caller child survives. Parent-loss notification is implemented;
a SIGKILL-of-client acceptance test was not added in this closeout. Stdout/stderr
are bounded while streaming. Artifact checks cover strict JSON, UTF-8, exact
names, owned regular files, envelope identity/status, and text format structure.
Valid partial results publish as partial. Domain refusal does not publish.

Explicit `acquire` transfers cleanup responsibility to its caller;
`AcquiredKit` supports context management/close. Automatic acquisitions are
removed. The Node CLI receives child-local `TAR_OPTIONS=--no-same-owner`; no
global configuration, public archive mutation, or engine rewrite is needed.

## Verified acceptance and controls

From repository root, with existing Node 22 and Python 3.12+ on Linux:

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 tools/python-useful-jobs-client/test/*.test.mjs
```

Final evidence: `evidence/client-final.tap`: **20 Node test entries, 20 pass,
zero failures/skips**, including a nested **12-test Python review suite**.
This count does not treat nested Python cases as additional Node entries.
A real fresh venv installs the client, then the console script executes a copied
archive from outside the checkout with `PYTHONPATH` and `SAMEDAYDESK_ROOT` absent.
No new global toolchain is installed. Other controls include:

- all nine sample-capable jobs plus held-file page-change;
- caller-relative paths with spaces, Unicode, quotes, newlines and shell literals;
- changed lockfile pins and real partial/refused pricing inputs;
- corrupted/missing/foreign/linked artifacts after real engine success;
- malformed/partial/invalid-UTF-8 stdout, invalid status type, stream overflow;
- nonzero exit after successful output, including exit 124;
- archive traversal, raw dot/duplicate-slash paths, links/special files,
  duplicates, oversized member header, wrong digest and size;
- existing/dangling destinations, late competing destination, parent swap;
- detached descendants after timeout and normal parent exit, unrelated child
  preservation, invalid timeout values;
- matching/mismatched archive bytes over an ephemeral loopback HTTP port.

The copied shipped archive's own suite passed **15/15**, one worker,
`NODE_OPTIONS=--max-old-space-size=768`, `TAR_OPTIONS=--no-same-owner`.
Evidence: `evidence/shipped-archive-tests.tap`. Reproduce in an owned temporary
extract of the pinned archive and run `node --test --test-concurrency=1 test/*.test.mjs`
from its root. Do not run archive-building tests in the public source directory.
No PostgreSQL was needed; no persistent HTTP service remains.

## Failing evidence, separate from readiness

- `evidence/D08-baseline.tap`: original consumer, **2 pass / 17 fail**. Stale
  archive/catalog pins and `pip --user` on an externally managed Python host
  explain the baseline. This is preserved observed failure, not readiness.
- `evidence/client-first-repair.tap`: **18/19**. The remaining assertion expected
  automatic catalog extraction to survive; the ownership contract now cleans it.
- `evidence/review-first.txt`: interrupted initial review run, no completed result.
- `evidence/review-closeout.txt`: initial authored controls had malformed tar
  construction, ineffective status mutation, and an invalid pricing fixture.
- `evidence/review-final.txt`: an intermediate fixture asserted partial for a
  fully comparable actionable delta. Final fixture uses conflicting numeric rows.
- `evidence/client-closeout.tap`: full 20/20 before the final malformed-status
  type guard; `client-final.tap` is the final-source acceptance record.

These intermediate failures are retained and superseded by final-source
acceptance. There is no known failing final consumer test. Expected refusing
controls assert the refusal and absence of published output; they are not passed
off as successful domain jobs.

## Dependency mismatch and next owner

`evidence/source-archive-comparison.json` compares mapped source files at the
integration base with the exact shipped archive: **66 equal, 23 different**.
The public entry and owned-spawn helper match; engine files in schema, route and
page-change differ. This client deliberately executes the shipped 1.4.1 bytes.
It does not prove current unshipped engine regression suites pass. No engine
regression authorizes edits here. No live-host archive verification is claimed.
Delivery validation does not recompute domain semantics, impose live disk quotas,
or sandbox Node's filesystem/network privileges.

**One next integration owner: Grok Heavy integration reviewer.** Ordered next
steps, if integration is requested after this completed closeout:

1. Review this feature branch. Exclusive change paths remain
   `tools/python-useful-jobs-client/` and
   `experiments/codex-window/cw64-installed-client-current-runtime/`.
2. Obtain the shared runtime/vendor owner's completed release ref and archive
   contract. Record any mismatch first; do not copy engines or rebuild public
   archives in this consumer task. For a later archive, refresh only packaged
   client pins and focused compatibility tests in the two owned paths.
3. Repeat the acceptance command and cold venv invocation against that exact
   archive before claiming compatibility with the later integration.

Recommend **this existing package as the single future canonical Python entry**.
D08 supplies packaging, CLI/acquisition and flexible caller-file arguments.
CW39 supplies a separate Work/stdin request envelope, input materialization and
zipapp entry with overlapping acquisition/delivery supervision, pinned to 1.4.0.
Its reusable request adapter can be considered in a separately assigned
consolidation, while retaining one engine adapter and one pinned contract. This
patch neither duplicates that wrapper nor adds another package/CLI.
