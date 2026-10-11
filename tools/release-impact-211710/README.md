# Finite installed-repair release impact

This cold CLI answers one Root decision for the accepted SDS301 archive-acquirer
repair. It reads explicit installation evidence and one exact source observation,
uses the existing recurring change/verification recipes, and leaves an immutable
result with Root's next check. It has no scheduler or installation action.

The installed subject is the local source CLI
`experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs`, accepted
at `5713db0158281e7ae61ba84bf86beb92b27de664`. The supplied fixture records an
actually executed Root-owned installation at product ref
`d760714c932fd317e1435b528575fecd95594183`, package `samedaydesk@1.0.0`, Node
`v22.14.0`, GNU tar `1.35`, accepted source blob
`e068d9974840cfe680a3f66964d3d88a5cf47141`. It is owner QA; customer installation
and hosted installation remain unknown/unverified. A public merge supplies no
installation acceptance on its own.

The original supported task is archive acquisition: refusal returns JSON
`ok:false` and exit 1; valid acquisition exits 0. Status/size/digest refusal does
not extract or execute an archive, and shell success branches stop on refusal.
GNU tar is relevant to the optional extraction branch. The acquirer imports only
Node built-ins, so another npm dependency's version is outside this supported
closure. Candidate behavior still requires its owning suite when this closure
changes. An unchanged comparison proves equality of the recorded conditions;
it does not claim a new candidate deployment or independent acceptance.

Run from the SameDayDesk repository on Node 22.x with Git and GNU tar installed.
The source refs must already exist locally. There is no dependency install for
the consumer and no automatic Git fetch.

```bash
# Replay the received finite observation at an explicit test clock.
node tools/release-impact-211710/cli.mjs \
  --installed tools/release-impact-211710/fixtures/installed-root-qa.json \
  --observation tools/release-impact-211710/fixtures/current-source-observation.json \
  --repo . --clock 2026-10-11T04:00:00.000Z --horizon-hours 24 \
  --out-dir /tmp/release-impact-root --pretty

# For another actual installed-state/source decision, choose new output names
# and supply the real capture clocks, exact refs, and an explicit horizon.
node tools/release-impact-211710/capture-installed.mjs \
  --repo . --ref d760714c932fd317e1435b528575fecd95594183 \
  --clock 2026-10-11T04:00:00.000Z --out /tmp/root-installed-separate.json
node tools/release-impact-211710/observe-source.mjs \
  --repo . --from d760714c932fd317e1435b528575fecd95594183 \
  --to d760714c932fd317e1435b528575fecd95594183 \
  --window-start 2026-10-11T04:00:00.000Z \
  --clock 2026-10-11T04:01:00.000Z --out /tmp/root-observation-separate.json

npm --prefix tools/release-impact-211710 test
npm run test:recurring-job-recipes
npm run test:useful-jobs-public
```

| Result | Root action |
| --- | --- |
| `unchanged` | Retain the installed repair and prior; a natural next need is not established. Unrelated source/dependency changes remain visible. |
| `relevant_change` | In an isolated checkout of the exact observed candidate ref, run `npm run test:useful-jobs-public` and receive its source/runtime conditions. This is a check request, not a proven regression. |
| `stale_baseline` | Capture fresh installed evidence into a separate file before comparing. |
| `insufficient_coverage` | Supply missing installation, baseline, supported source objects or runtime coverage. |
| `partial` / `timed_out` / `error` | Retain the observation and successful source witnesses; request a fresh bounded observation for the unresolved portion. |
| `uncertain_state` | Inspect the retained pending/damaged file and input digests. Preserve it; a fresh invocation needs Root's explicit decision and a different clock/input. |

Exit 0 means a supported assessment. Exit 2 means refusal or uncertainty; exit 1
means an operational/argument error. Every accepted invocation writes an immutable
pending marker and atomically publishes a sealed result. Same input bytes, clock
and horizon retrieve the original result. A cold restart with only a pending
marker cannot repeat the assessment. Existing result bytes and the installed
prior are never replaced. Checksums bind bytes, not independent attestations.

The observation carries both commit/tree/blob witnesses, capture window, declared
source/dependency coverage and two-snapshot history. This is a source comparison,
not a census of releases or intermediate history. An optional `--runtime file`
on the observer accepts explicit target versions with `evidenceKind` set to
`operator_supplied_target`; default versions are observed on the local analysis
host. Neither establishes that a candidate runtime has been installed elsewhere.
The consumer checks the exact source objects through Git before a positive
assessment. It never runs candidate code.

For a mounted source, replace `--observation` with `--observation-url
http://127.0.0.1:PORT/observation.json --mounted-origin`. The existing bounded GET
transport caps responses at 1 MiB, follows no redirect and performs one request
per invocation. A raw primary-source JSON file may be read from an explicit
`https://raw.githubusercontent.com/epistemedeus/samedaydesk/` URL. The URL route
reads the observation before duplicate reconciliation; it may repeat that GET,
but never repeats an installation, mutation or payment. Local inputs are bounded
regular files and reject final-component symlinks.

Only supported source metadata is exported. Complete input files and unrelated
knowledge remain immutable at their original locations. This consumer never
changes retained correction validity; 211400 owns applicability. Unknown prior
payment stays unknown, even after cold recovery. Host costs, requester,
receiving/support effort and outside usefulness remain unpriced/unproved.

The direct maintained route is Git's exact scoped diff, installed source/runtime
verification and the existing owning suite when needed. It is sufficient for a
single manual check. The retained asset here is the reusable supported-condition
slice and source-bound result/refusal that a cold Root reader can receive without
reconstructing the old investigation. See the bounded
[result](../../docs/reviews/release-impact-211710/RESULT.md) and
[admission record](../../docs/reviews/release-impact-211710/REUSE-AND-ADMISSION.md).
