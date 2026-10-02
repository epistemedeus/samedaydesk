# Hosted useful journey client 0.1.1

MIT; Node 22.x (tested v22.22.2); no dependencies or npm install. This is a
minimal client successor alongside the sealed offline useful-jobs archives.
It does not bundle a replacement recipe engine or store. Examples are named QA
inputs. Run with your own supplied JSON; no example is an automatic default.

The origin must have Root's received adapter mounted. Public snapshot evaluation
can work without job enrollment. Jobs require an existing project-scoped writer
or owner bearer in `USEFUL_JOURNEY_TOKEN`, kept outside the journal and stdout.

```bash
node cold-client.mjs help
node cold-client.mjs evaluate --origin https://samedaydesk.com --input caller-request.json
node cold-client.mjs run --origin https://samedaydesk.com --project "$PROJECT_ID" \
  --input caller-request.json --operation-key caller-operation-001 --journal ./caller-operation.json
node cold-client.mjs recover --origin https://samedaydesk.com --project "$PROJECT_ID" \
  --journal ./caller-operation.json
node cold-client.mjs result --origin https://samedaydesk.com --project "$PROJECT_ID" \
  --job "$JOB_ID" --task "$TASK_ID"
node cold-client.mjs cancel --origin https://samedaydesk.com --project "$PROJECT_ID" \
  --job "$JOB_ID" --task "$TASK_ID" --operation-key caller-cancel-001
node cold-client.mjs export --origin https://samedaydesk.com --project "$PROJECT_ID" \
  --job "$JOB_ID" --input caller-export-request.json
```

These are conditional operational commands, not a report of hosted readback.
The client saves the original operation/body before admission. Lost replies keep
that journal; recovery rebinds it to the server's original operation before
trusting a job id. Status, retrieval and current authorization survive process
restart. `running` means poll the same job; there is no implicit repeat daemon.

A later task supplies `input.priorResult: {jobId, taskId, digest}` and changed
current snapshots, a new task and operation key. The backend checks the exact
retained digest, recipe and current tenant authority before deriving a prior.
Inline priors are caller assertions, not admitted evidence. Export separately
requires `optIn: true`, `purpose: "later-task-reuse"`, `taskId`, `resultDigest`,
`subject`, positive `sequence` and UTC `clock`. It is a customer-held unverified
task-memory observation; it does not publish, contribute, accept or settle work.

All file/stdin intake, journal writes, HTTP bodies, backend PG, owned recipe
children, responses and stdout share one deadline/allowance. Each request sends
the original deadline, byte cap and consumed bytes; the backend returns its
cumulative charge before the client reads output. A successful response without
that receipt is refused. Original admitted execution limits survive recovery.
Each later retrieval/recovery command has its own bounded read allowance; it
cannot extend the admitted execution deadline or byte cap. A lost reply keeps
its commit outcome unknown until current-authority recovery.
Defaults: 30s, 64KiB input, 64KiB output, 512KiB aggregate. `--deadline-ms`,
`--total-bytes` and `--output-bytes` can reduce these. Symlinks/FIFOs are refused.
Server execution reserves time for fenced durable completion; insufficient
remaining budget is a useful failure, never an invented success.

Publication, production enrollment, outside usefulness and settled payment remain
unverified. Root owns source receiving, final mount/index, hosting and outreach.
