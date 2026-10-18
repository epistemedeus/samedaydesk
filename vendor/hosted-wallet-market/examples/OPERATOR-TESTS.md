# Operator regression exercises

These are the fixture commands consumed by `server/scripts/test-root404-cold-requester.mjs`. Run the test against disposable PostgreSQL and verified TLS. The independent receiver is `server/scripts/test-root410-requester-receiving.mjs`; it drops responses after commit and checks stored readback without repeating the account mutation.

`ORIGIN` and `CA` below belong to the disposable HTTPS fixture. Copy the script into an empty private directory. No live signup or post follows from this test recipe.

```sh
node cold-requester.mjs profile --origin "$ORIGIN" --ca-file "$CA"
node cold-requester.mjs wrong-wire --origin "$ORIGIN" --ca-file "$CA"
node cold-requester.mjs signup --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --display-name "Cold Requester" --role requester
node cold-requester.mjs replay-signup --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs readback --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --operation signup
node cold-requester.mjs login --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs recover --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs login --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs post --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --title "Cold unfunded need" --summary "Interest only. No commission and no payout is offered." --criterion observable
node cold-requester.mjs replay-post --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs conflict-post --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs post-without-csrf --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs discover --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs signup --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --display-name "Cold Contributor" --role contributor
node cold-requester.mjs post --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --title "Contributor cannot post" --summary "A contributor session cannot create the requester listing." --criterion observable
node cold-requester.mjs interest --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --peer-secret requester.json --note "Interest only. This is not commissioned work."
node cold-requester.mjs fund --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json
node cold-requester.mjs signup --origin "$ORIGIN" --ca-file "$CA" --secret-file abandoned.json --display-name "Abandoned Signup" --role requester
```

The wrong-wire, conflict, missing-CSRF, contributor-post and fund commands must fail. Retain QA account, task and operation IDs in a private exclusion packet. Funnel exclusions filter reads, never delete the underlying business records.

For an interrupted account operation, retain its file and run `readback --operation signup`, `login` or `recover`, matching the interrupted operation. Do not repeat signup under another key. Readback expires after 15 minutes, and a later session delivery can supersede its cookie. A confirmed refusal remains a refusal. Never infer a successful mutation from a timeout.

Capability-off rollback is tested by restarting this same candidate with the profile unset. That test does not restore the predecessor binary. The source and deployment rollback procedure is in `../COLD-REQUESTER.md`.

## Committed cold-mutation response recovery

Run `node --test --test-concurrency=1 --test-timeout=300000 server/scripts/test-root425-cold-mutation.mjs` in the exact SDS checkout. It mounts `createSdsApp` on disposable PostgreSQL with a nondefault configured schema and verified TLS. Faults occur after commit: lost response, empty/malformed/unexpected JSON, and a truncated HTTP200 body. The actual client must exit2, retain the same key/body plus private observation bytes, refuse a fresh mutation while unresolved, and recover via readback. A lost readback can be repeated. No business POST is repeated by recovery.

```sh
node cold-requester.mjs readback --origin "$ORIGIN" --ca-file "$CA" --secret-file requester.json --operation post
node cold-requester.mjs readback --origin "$ORIGIN" --ca-file "$CA" --secret-file contributor.json --operation interest
```

The contributor uses only their own file. For an expired session, log in to the same account using that file, then repeat readback. Retain the original operation key/body; do not use `interest`, `post`, a replay command, another key or another account as recovery. Account readback still has its existing15-minute secret-delivery limit. Cold mutation receipts have no new expiration.

The HTTP contract is authenticated, CSRF-protected `POST /v1/market/readback`, with the original `idempotency-key` header and `{action:"post"|"interest",input:originalBody}`. New mutations commit the effect, one transition and an existing-store idempotency receipt in one transaction. Wrong actor/tenant/action/body/task/key refuses. Only nonfinancial post/interest use this transaction.

The private mode0600 file retains up to24 observations per operation: exact first16384 received body bytes (base64), total received-byte hash/count, completeness/termination, and Node's raw header pairs (HTTP header parser limit8192). Larger bodies are explicitly marked capture-truncated; network data is capped at1MiB and20seconds. These are application observations, not a raw TLS transcript. File size and operation history are bounded; archive the original privately before capacity maintenance, never discard observations to claim a clean response. Standard output contains only bounded diagnostics, never response bodies/header values or account secrets.

A pre-upgrade transition did not record the original body. Readback may return `evidence:legacy_transition_and_current_effect`, `originalBodyRecorded:false` only when the exact operation/action/principal/task transition and matching current effect are unambiguous. Additional interest transitions or a different current note refuse. This does not reconstruct an uncaptured response or establish its cause. It creates no retroactive receipt row, commission, funding or acquisition claim. The test's injected empty body is a tolerance case, not a diagnosis of any live incident.
