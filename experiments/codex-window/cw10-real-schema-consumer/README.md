# CW10 real schema consumer

A bounded, offline consumer gate for the official Octokit
`organization.renamed` schema correction. It verifies the released useful-jobs
1.4.0 archive, runs its real CLI on schema documents, and independently checks
complete request bodies with Ajv 8.17.1 and ajv-formats 3.0.1 under Draft7.

## Finding

The [official change](https://github.com/octokit/webhooks/commit/e69d6eca4e5f1505afacd0677c4303877caca0d6)
on December 29, 2022 replaces required `membership` with required `changes`,
removes the `membership` property schema, and retains
`additionalProperties: false`. This consumer now uses that exact commit and its
parent, rather than comparing the parent with a later upstream head. Work's
later root schema has the same JSON meaning, with different whitespace.

The composed legacy request is accepted before and rejected after for exactly
**missing `changes` and forbidden `membership`**. Adding `changes.login.from`
and removing `membership` produces the official new example; either operation
alone still fails. Removing a name from `required` alone is a weakening. The
additional rejection comes from removing the allowed property while the object
is closed, as specified by [Draft7 object validation](https://json-schema.org/draft-07/draft-handrews-json-schema-validation-01#rfc.section.6.5).

| Input to engine | Released 1.4.0 | CW14 `8b752017…` |
| --- | --- | --- |
| Exact schemas, `/required` and `/additionalProperties` | Informational, 2 unchanged, 0 breaking/unknown | Same false negative |
| Exact schemas, root pointer | Refused: relative resource refs | Same refusal |
| Derived root-keyword projection, root pointer | Actionable, 1 breaking | Actionable, 1 breaking |

Engine reports are checked for `kind: json-schema`, `exampleMode: false`, and
matching before/after/used byte hashes. The CLI receives schemas, not example
payloads. Complete-body Ajv validation compiles all nine schema resources
(five before, four after) offline and enables `uri` and `uri-template` formats.
Negative controls cover invalid URI, nested `changes.login.from`, and the
optional installation reference. Every upstream file is hashed, including all
transitive references and both source examples.

## Run

Node >=22, npm, Git and GNU tar. From this directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
node bin/check.mjs --mode audit --out-dir /tmp/cw10-audit
node bin/check.mjs --out-dir /tmp/cw10-gate
```

Use fresh output directories. The final command exits **1**, because the
request-body compatibility gate found a break. `--mode audit` exits **0** only
when the pinned false negative and witnesses reproduce. Invalid inputs or
failed assertions exit **2**. Audit success is not compatibility acceptance.

The default acquisition verifies the archive already committed in this source
checkout. `--archive /path/to/useful-jobs-1.4.0.tar.gz` (or
`USEFUL_JOBS_ARCHIVE`) selects a local archive; `--archive download` explicitly
fetches the pinned public release. Byte count and SHA-256 are checked before
fresh extraction. The old `--archive-root` interface is rejected: a package
name/version alone cannot authenticate an arbitrary extracted tree.

For the exported CW14 candidate, first fetch its branch into **your own** repo,
then pin an exact SHA. The runner uses `git archive` to make an isolated engine
copy; it never executes a sibling's dirty workspace:

```sh
git fetch origin codex/cw14-schema-semantics-20260912
node bin/check.mjs --mode audit --out-dir /tmp/cw10-cw14 \
  --candidate-head 8b75201761a8b58a6d00f16d9eb825c15fc5b68b \
  --release-tests run
```

`--candidate-repo /your/checkout` selects a different Git object store.
Candidate results are observed, not assumed to fix the released regression.
The report pins both its commit and engine tree.

`ci/read-only-check.sh` installs pinned dependencies, runs consumer tests and the
unchanged release's full 15-test suite, and asserts that the actual compatibility
gate exits 1. Set `CW10_CANDIDATE_HEAD`, optionally `CW10_CANDIDATE_REPO`, and
`CW10_OUTPUT_DIR` to retain a candidate receipt. All tests use one worker and a
768 MB heap. `TAR_OPTIONS=--no-same-owner` applies to nested extraction too;
the consumer test preload assigns the release download test's loopback listener
to port 55547. No release source, assertions or vendor pins are changed.

`npm run sources:verify` is a separate explicit network check of all immutable
upstream URLs and the change commit's parent. Normal tests and CI need no
upstream schema fetch; npm installation still needs its registry or cache.

## Pins and evidence limits

- Consumer source base: `505f90f1de26fcf1bea627806361cdc178db13f4`.
- Official before: `237b6924bcbfd2d0d36e7233d36c2c6bc21fa2a2`.
- Official after: `e69d6eca4e5f1505afacd0677c4303877caca0d6`.
- Release source: `817a00ca226a94b0e198b29fcd06245b2a92adec`.
- Release: 2,575,215 bytes, SHA-256
  `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
- MIT-licensed official files and exact per-file provenance:
  [manifest](fixtures/manifest.json), [license](licenses/octokit-webhooks-MIT.txt).

There is no old `organization/renamed.payload.json` at the parent upstream path
(HTTP 404). The saved request combines the exact change's renamed example with
membership from the exact parent's member-added example. Both components match
Work's later examples semantically. This is a real **schema accepted-instance
counterexample**, not proof GitHub previously sent that composed event, a
customer incident, demand, or independent production use. Ajv is a separate
validator implementation; the tests and fixtures here are self-authored.

See [CW14 handoff](fixtures/regression/README.md),
[patch proposal](PATCH-PROPOSAL.md), and [execution receipt](RECEIPT.md).
