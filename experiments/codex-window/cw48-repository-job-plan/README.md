# Repository change job planner

Build one local, reviewable plan from a caller-owned Git commit pair. Requires Node 22+, Git and tar; no npm install, server, credentials, or network. Run from any working directory using the absolute CLI path. Use an existing output parent and a new output directory.

```sh
PLANNER=/path/to/samedaydesk/experiments/codex-window/cw48-repository-job-plan/cli.mjs
node --max-old-space-size=768 "$PLANNER" plan \
  --repo /path/to/caller-repository --base BASE_COMMIT --head HEAD_COMMIT \
  --policy /path/to/policy.json --out /path/to/new-plan
sha256sum /path/to/new-plan/plan.json
node "$PLANNER" verify --out /path/to/new-plan --sha256 SHA256_FROM_PREVIOUS_COMMAND
```

`policy.example.json` is the starting policy. `callerOwned:true` is the caller's assertion, not authenticated ownership. Explicit allowed job IDs and zero cost cap are mandatory. `execution:live-required` stops: this tool has no current exact merchant offer verification interface. A generic GET /models endpoint does not establish migration compatibility.

JSON stdout is the plan; exit 0 means ready or no Git changes, exit 2 means explicit stops or an error. `ready_with_stops` preserves useful selected operations alongside uncovered files. A plan never asserts semantic no-change. Every changed path appears, including source languages, additions, deletions, symlinks, and unsupported formats. Renames appear as delete/add. Only modified JSON snapshots are eligible. Other lockfile formats remain suggestions and stop. Binary JSON and invalid UTF-8 refuse before parsing.

A selection includes exact `command.cwd` relative to the bundle root, an argv array, expected output paths relative to the bundle root, input Git OIDs and SHA-256, the reused preflight receipt, bounds, and approval/stop conditions. After reviewing and verifying the bundle, the caller can invoke that argv from its declared cwd. The planner itself never executes jobs. The entire bundle can be moved before verification and caller execution. Verification requires the previously recorded plan hash, then verifies every bundled input and release file. Reverify after any change. Verification is a point-in-time check, not a sandbox for simultaneous hostile filesystem writers.

For schema/webhook input, declare the used JSON Pointers. For held page captures, declare fields and a clock. These values are policy-owned, never guessed from the repository:

```json
{
  "bindings": [
    {"path":"events/schema.json","job":"json-schema-webhook-drift","used":{"pointers":["/event","/id"]}},
    {"path":"captures/vendor.json","job":"page-change-offline-job","fields":["title","description"],"clock":"2026-09-12T06:00:00Z"}
  ]
}
```

Bindings are exact repository-relative paths, not globs. They can also explicitly route webhook-example JSON whose structure has no unambiguous heuristic. Missing used pointers, ambiguous suggestions, unsupported jobs, and bindings outside the diff stop. Nested page captures are constructed only from the two frozen Git blobs; input documents cannot cause file reads or uploads. SAMPLE sibling metadata is checked in both Git trees. Worktree files, untracked files, LFS downloads, filters, textconv, replacement objects and lazy object fetch are not used. Revision names are resolved to commits before reads and checked again before publishing. Full commit IDs are preferable.

The released parsers establish input admissibility, not output completeness. Unknown schema combinators, duplicate identities, missing page fields, stale/partial captures, and incomparable vendor units can remain unknown in engine output. Stop and review them. Vendor prices are caller snapshots, not a live quote or a bill estimate. No price authority or payment client is added.

Policy bounds may only tighten defaults. Raw Git input bytes have per-file and aggregate caps; structured JSON has node/depth/array bounds and selected jobs have aggregate row bounds. Generated used-pointer/page job documents are additionally bounded by the 64 KiB CLI policy cap and the existing 1 MiB preflight cap. Release extraction and integrity files are separate from caller input budgets. Trusted implementation files and the committed public archive are required; this is not an untrusted archive loader.

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/codex-window/cw48-repository-job-plan/test/planner.test.mjs
```

Tests use disposable, actually committed multi-language Git repositories and the actual released CLI. Temp roots and owned CLI process groups are cleaned. No port is opened; 55555 remains unused. H6D corpora and HG04 vendor CI are not duplicated; their producers can provide committed JSON captures and declared policy via this same interface.
