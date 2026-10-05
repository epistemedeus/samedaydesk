# Original A: bounded progress receiving

Root receives this export from accepted main `f0eedc292ee5ba03f536b0c2c1c4dd8f45f67e8a`, then uses the ordinary named **`build:managed-foundry`** for serving source. No installer, migration, allocation transition, generation renewal, replacement attempt, refill or owner recovery action is needed. Keep all current environment values, opt-in, private enrollment, verified CA file route and original history.

Continue the **existing** 0600 owner config and private caller directory `/home/ubuntu/root-private-foundry-journey1005`; do not recreate them. Substitute only the already existing config filename:

```sh
caller_config=/absolute/path/to/Root-existing-1005-owner-config.json
node server/foundry/activation/remote-private-journey.mjs a-reconcile "$caller_config"
```

Require original project **`prj_5cboYklXAf5S8Gio`**, original registration **`ven_LN-0OoD1GHnf_iur`**, unchanged allocation/entry terms, HTTP 200 / receiver ready / exit 0. No checkpoint, contribution or physical work is started by `a-reconcile`. HTTP 202 stays partial / exit 2. A transport loss stays unknown; preserve the same proof/attempt/continuation and continue only that attempt. The canonical client's existing 10-second response deadline remains; a safe owned receiving operation may complete after the reply is lost, and later reconciliation reads it rather than repeating begin.

If grants expire again, canonical `renew` uses the **same existing** `visitor-a.config.json`, proof and attempt, then `a-reconcile` continues. Renewal changes only existing grant expiry within the fixed workspace deadline; it does not consume another admission. A workspace-expired refusal is retained, never bypassed by new registration or extended terms.

Root can repeat the exact original read-only **`root-observe-entry-a1005`** request through **`build:managed-foundry-private-pass`**, using its existing private environment/file adapter. The ten input fields remain unchanged:

```json
{"schema":"sds.foundry.private-pass.v1","intentId":"root-observe-entry-a1005","action":"observe","projectId":"prj_5cboYklXAf5S8Gio","expectedHostConfigId":"sha256:c7938fd96a127f6394f800312ea50dfe1d2e7b07d59e2b65f81a66353e59bf4d","expectedEntryTermsHash":"sha256:ef3d1d1c68de03dba316d097f43e69ed2e190da2b86e270f82f9c5ae158b40b5","expectedVerificationId":null,"candidateId":null,"expectedGeneration":null,"reconcileIntentId":null}
```

Match these Root-supplied identities against actual readback. Preserve `CORRESPONDENCE_PGSSL_CA_FILE` pointing at the already verified private `prod-ca.pem`, DNS hostname and verify-full. No full environment PUT or multiline PEM changes.

New private fields are `readback.entry.progress` and `readFailureCode`. Progress binds the exact stored registration/project/request/receiver/allocation/terms. It records bounded marker/begin/recover/read outcomes, fixed error-code aliases and durations, observed and acknowledged states, and receiving/acknowledgment/SQL-cleanup budgets. It contains no SQL, credential, grant, error prose or private correspondence. The existing idempotency table stores one private diagnostic row per registration; no migration or allocation namespace change occurs. A durable `plannedPhase` is a plan, not evidence the port ran. Missing trace means no retained phase proof. Final trace replacement may be lost during a DB failure; a prior plan cannot establish completion.

Current canonical observation still proves pool/config/installed verification separately. Read failure returns unknown, `poolReady:false`, null verification fields and no trusted execution arrays, while preserving safely read entry/admission facts. The last trace is diagnostic, never verification authority. Lock/connection failure can still refuse observation; repeat an explicit read only after the bounded owned operation has ended, rather than inferring readiness.

`reconcileReceiver` has **20,000ms total** for durable marker and receiving ports, **3,000ms** for acknowledgment/trace, and an existing **5,000ms** server statement bound for SQL cleanup after disconnect: **28,000ms conservative receiving/cleanup envelope**, after the existing proof/project/grant binding. Connection 3s, statement 5s, driver query 6s and lock 1.5s limits remain. The deadline destroys only its checked-out SQL lease. A commit whose reply is lost remains uncertain until exact readback; physical ownership is never released or reassigned. Recovery now verifies the reserved binding and completes in one locked transaction, without a prerequisite one-second read or a post-preliminary-transaction abort gate. This is not an unbounded timer, retry loop or worker.

After exact ready readback, continue the same `a-contribute`, explicitly observe/dispatch controlled verification/publication, `a-use`, Root's actual HTTP stop/start, `b-use`, read-only A/B observations and offline `check` from [100504's procedure](../receiving-100504/ROOT.md). Require actual source candidate/generation and exited/drained invocation witnesses. No actual Hostinger result is established by this VM receipt.

Primary semantics: [node-postgres lease destruction](https://node-postgres.com/apis/pool#releasing-clients) and [PostgreSQL statement/lock timeouts](https://www.postgresql.org/docs/17/runtime-config-client.html). Destroying a client is not a witness that its server statement has already stopped; tests wait for only the owned backend within the existing timeout.
