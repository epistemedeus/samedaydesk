# H04 engine smoke invocations

Read-only worktrees. `--out-dir` is always under `/tmp/w5-h04/h04-engine-smoke/<id>` (never the RO tree). `--example` / SAMPLE is **not** a customer job.

Stdout/stderr from these runs is captured under `inventory/smoke/` when executed.

Node observed at smoke time: record in `inventory/smoke/meta.txt`.

## Shared setup

```bash
mkdir -p /tmp/w5-h04/h04-engine-smoke
mkdir -p /tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/smoke
node -v
```

## SDS52 wrapper (`aeef964fa188443078958d9d6d393afae1d542ee`)

cwd: `/tmp/w5-h04/ro-sds52`

```bash
SDS=/tmp/w5-h04/ro-sds52
CLI="$SDS/server/paid-useful-jobs/bin/cli.mjs"
SMOKE=/tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/smoke
OUT=/tmp/w5-h04/h04-engine-smoke

# help
node "$CLI" --help | tee "$SMOKE/sds52-cli.help.txt"

# list
node "$CLI" list | tee "$SMOKE/sds52-cli.list.json"

# --example per job (labeled SAMPLE; not a sale)
node "$CLI" run api-upgrade-brief --example --out-dir "$OUT/api-upgrade-brief" \
  | tee "$SMOKE/api-upgrade-brief.example.stdout.json"

node "$CLI" run vendor-budget-impact --example --out-dir "$OUT/vendor-budget-impact" \
  | tee "$SMOKE/vendor-budget-impact.example.stdout.json"

node "$CLI" run feed-agenda --example --out-dir "$OUT/feed-agenda" \
  | tee "$SMOKE/feed-agenda.example.stdout.json"

node "$CLI" run evidence-ci-annotation --example --out-dir "$OUT/evidence-ci-annotation" \
  | tee "$SMOKE/evidence-ci-annotation.example.stdout.json"

node "$CLI" run listing-repair-packet --example --out-dir "$OUT/listing-repair-packet" \
  | tee "$SMOKE/listing-repair-packet.example.stdout.json"

node "$CLI" run repeat-job-record --example --out-dir "$OUT/repeat-job-record" \
  | tee "$SMOKE/repeat-job-record.example.stdout.json"
```

## W4 schema/webhook (`94c7bfdfeaa99f5e70f341504df3051cc7717f91`)

cwd: `/tmp/w5-h04/ro-w4-schema`

```bash
WT=/tmp/w5-h04/ro-w4-schema
CLI="$WT/tools/json-schema-webhook-drift/bin/webhook-drift.mjs"
SMOKE=/tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/smoke
OUT=/tmp/w5-h04/h04-engine-smoke/json-schema-webhook-drift

node "$CLI" --help | tee "$SMOKE/json-schema-webhook-drift.help.txt"
node "$CLI" --example --out-dir "$OUT" | tee "$SMOKE/json-schema-webhook-drift.example.stdout.json"
```

## W4 lockfile (`e81efc8ab71b1bde88eca743d297149e61bbb6f2`)

cwd: `/tmp/w5-h04/ro-w4-lockfile`

```bash
WT=/tmp/w5-h04/ro-w4-lockfile
CLI="$WT/tools/lockfile-pin-delta/bin/lockfile-delta.mjs"
SMOKE=/tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/smoke
OUT=/tmp/w5-h04/h04-engine-smoke/lockfile-pin-delta

node "$CLI" --help | tee "$SMOKE/lockfile-pin-delta.help.txt"
node "$CLI" --example --out-dir "$OUT" | tee "$SMOKE/lockfile-pin-delta.example.stdout.json"
```

## W4 routes (`7387eb677abd442dfab9081cb0ad95451fd2a762`)

cwd: `/tmp/w5-h04/ro-w4-routes`

`--out-dir` is required even with `--example`.

```bash
WT=/tmp/w5-h04/ro-w4-routes
CLI="$WT/tools/route-table-diff/bin/route-diff.mjs"
SMOKE=/tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/smoke
OUT=/tmp/w5-h04/h04-engine-smoke/route-table-diff

node "$CLI" --help | tee "$SMOKE/route-table-diff.help.txt"
node "$CLI" --example --out-dir "$OUT" | tee "$SMOKE/route-table-diff.example.stdout.json"
```

## W4 pages (`91b57334818ecd7940cb854e9864f3b1749d1d1d`)

cwd: `/tmp/w5-h04/ro-w4-pages`

`--example` is a **refuse** (`sample_as_delivered_watch`), printed on stderr, exit 2. The labeled fixture analog is `journey` (still not a customer job).

```bash
WT=/tmp/w5-h04/ro-w4-pages
CLI="$WT/tools/page-change-offline-job/bin/page-change.mjs"
SMOKE=/tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/smoke
OUT=/tmp/w5-h04/h04-engine-smoke/page-change-offline-job

node "$CLI" --help | tee "$SMOKE/page-change-offline-job.help.txt"

# expected refuse
node "$CLI" --example --out-dir "$OUT" \
  >"$SMOKE/page-change-offline-job.example.stdout.txt" \
  2>"$SMOKE/page-change-offline-job.example.stderr.json"
echo $? | tee "$SMOKE/page-change-offline-job.example.exit.txt"

# fixture analog (not --example; not a customer job)
node "$CLI" journey --out-dir "$OUT/journey" \
  | tee "$SMOKE/page-change-offline-job.journey.stdout.json"
```

## Observed smoke

Ran 2026-09-11T22:54:21Z, Node `v22.22.2`. Captures in `inventory/smoke/`. `--out-dir` artifacts under `/tmp/w5-h04/h04-engine-smoke/<id>` (not copied here as corpus).

| id | --help | --example | notes |
| --- | --- | --- | --- |
| `api-upgrade-brief` | n/a (wrapper `--help` exit 0) | **ran** exit 0; `ok=true sample=true sold=false fundingState=unfunded`; wrote `upgrade-brief.json/.md` + `receipt.json` | SAMPLE, not a sale |
| `vendor-budget-impact` | same wrapper | **ran** exit 0; same contract; `budget-impact.json/.md` | SAMPLE, not a sale |
| `feed-agenda` | same wrapper | **ran** exit 0; `agenda.json` + `agenda.ics` | SAMPLE, not a sale |
| `evidence-ci-annotation` | same wrapper | **ran** exit 0; `annotations.json/.md` | SAMPLE, not a sale |
| `listing-repair-packet` | same wrapper | **ran** exit 0; `repair-packet.json/.md` | SAMPLE, not a sale |
| `repeat-job-record` | same wrapper | **ran** exit 0; `repeat-job.json/.md` | SAMPLE, not a sale |
| `json-schema-webhook-drift` | exit 0 | **ran** exit 0; `ok=true sample=true customerBrief=false kind=json-schema status=actionable breaking=1` | SAMPLE, not a customer brief |
| `lockfile-pin-delta` | exit 0 | **ran** exit 0; `ok=true provenance=fixture status=actionable purchaseAuthority=false` | SAMPLE, not a customer delta |
| `route-table-diff` | exit 0 | **ran** exit 0; `ok=true sample=true publishedRouteTable=false`; stderr is Node `NO_COLOR`/`FORCE_COLOR` warning only | SAMPLE, not published table |
| `page-change-offline-job` | exit 0 | **ran, refused** exit 2 stderr `{"ok":false,"code":"sample_as_delivered_watch","message":"SAMPLE or --example is not a delivered watch"}` | by design; `journey` analog exit 0 `verdict=changed networkUsed=false` |

SDS52 `list` observed: `{"ok":true,"jobs":["api-upgrade-brief","vendor-budget-impact","feed-agenda","evidence-ci-annotation","listing-repair-packet","repeat-job-record"],"liveSettlement":"out-of-scope"}`.
