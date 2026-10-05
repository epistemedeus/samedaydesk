# Private owner pass: Root receiving

Receive the exported head/PR; preserve all sixteen original environment values. This package does not enroll, migrate, reset, renew verification, opt in the listener or deploy itself. Owner QA is distinct from outside adoption, payment and revenue. The accepted execution profile, CPython/Wasmtime pins, launcher and sealed limits are unchanged.

The explicitly selected package script is **`build:managed-foundry-private-pass`**. It reuses the normal `build:managed-foundry` artifact build (unchanged client, pinned interpreter and `foundry:managed-probe`), then runs `foundry:private-pass` once. The pass is independent of serving opt-in and absent from normal `build`, startup, installer and ordinary managed build. Its CLI accepts no arguments or executable selection. The existing `foundry:worker` remains a private canonical worker, not an HTTP endpoint or scheduler.

Keep `FOUNDRY_PRIVATE_DIR` at the existing private absolute directory (0700, outside checkout/public_html, no symlink). Continue using the verified existing **`CORRESPONDENCE_PGSSL_CA_FILE=<private directory>/prod-ca.pem`** route. Do not re-enroll inline PEM, rewrite the certificate, use a multiline hPanel field, weaken verify-full or use the full-replacement environment PUT. Existing CA file must be 0600, single-link and no-follow; connection URL must retain `sslmode=verify-full` and its DNS hostname. Change only individually selected hPanel keys; Root owns actual values/readback.

Set exactly one request via individual hPanel key **`FOUNDRY_PRIVATE_PASS_JSON`**, one JSON line, or use **`FOUNDRY_PRIVATE_PASS_FILE`** for a pre-existing 0600 file directly in that private directory. If both are supplied they must match. Use a new intent ID for a different request. The request's ten exact fields are:

```json
{"schema":"sds.foundry.private-pass.v1","intentId":"owner-observe-a","action":"observe","projectId":"<existing visitor A project ID>","expectedHostConfigId":"sha256:c7938fd96a127f6394f800312ea50dfe1d2e7b07d59e2b65f81a66353e59bf4d","expectedEntryTermsHash":"sha256:ef3d1d1c68de03dba316d097f43e69ed2e190da2b86e270f82f9c5ae158b40b5","expectedVerificationId":null,"candidateId":null,"expectedGeneration":null,"reconcileIntentId":null}
```

The allocation/terms above are **Root-reported receiving identities**, not independently measured here. Require actual current readback before using them. Digests use their canonical `sha256:` prefix. `observe` performs no retained DB writes, no assignment and no publication; it persists only a local private request/prepared intent file. It reports bounded pool verification, original ceilings/charges, candidates, publications, canonical task/manifest/input/request/module/generation bindings, compile/instantiate/execute observations, usage and exited/drained witnesses. It excludes grants, private correspondence text, environment values, DB URL, stderr and guest source/output bytes.

After observation, supply a separate durable dispatch request with `action:"dispatch"`, a fresh `intentId`, and the exact observed `expectedVerificationId`, contributed `candidateId`, `expectedGeneration:1`, `reconcileIntentId:null`. Dispatch requires the sole active queued candidate in that project, current installed verification, matching host allocation/entry terms and zero outstanding physical ownership anywhere in that allocation. It never dispatches a different project. Existing canonical assignment consumes the existing budget; canonical recovery publishes pending evidence after witnessed reconciliation. No extra publication engine or capacity exists.

Run the named build explicitly and retain the last **`sds.foundry.private-pass-result.v1`** JSON line from Root's actual build readback. Do not interpret the preceding probe success as publication/use. A 90-second operator AbortSignal is passed to the accepted supervisor; it owns cancellation/kill/reaping/pipe drain. SQL uses the canonical bounded connection, query and lock timeouts. Guest limits are unchanged. Deadline/SIGTERM cannot free uncertain ownership.

Request and phase receipt files are immutable, fsynced 0600 files inside the private directory. Names use the canonical digest of the intent ID. The existing `correspondence_idempotency` table's private scope `sds:private-pass:v1` records started/unknown/completed plus exact request hash and assignment ID; no new migration/table is needed. Intent, exact queue check, canonical charge and assignment commit atomically under the existing host/pool locks. At most min(64, original maxCommands) operator journal records per project are allowed; physical/invocation/validation ceilings remain canonical.

Retry the **exact** dispatch request after response loss. Completed replay compares fresh current binding and immutable assignment/publication witnesses and does not run another assignment. Started/unknown returns `ok:false, code:private_pass_outcome_unknown` with bounded readback. It keeps capacity/history; a new dispatch intent cannot bypass it. A local prepared/started receipt alone is not completion. A started/unknown/completed private receipt with no matching durable journal refuses new work (`private_pass_journal_missing`); restoring a response cannot erase intent history. If the assignment already has complete canonical exit/drain observations, use a fresh intent with `action:"reconcile"`, the same project/host/terms/verification/candidate/generation and `reconcileIntentId:<original dispatch intent>`. This consumes existing evidence and canonical publication only; it never starts a child. Unlaunched reservations or incomplete/unknown exit/drain evidence remain held and are refused for explicit operator investigation; there is no PID/timeout cancellation or reset path here.

Stale installed execution policy or changed candidate generation fails closed. Use the previously received explicit `foundry:generation` procedure for renewal/revalidation; neither this pass nor any build changes authority or makes old evidence current.

# A / controlled verification / actual HTTP restart / B

Run the pinned caller on Root's enrolled receiving machine from this exact source. All configuration, grants and continuation files must remain outside checkout/public_html. Create a 0700 caller directory and a 0600 config (do not put credentials in shell arguments):

```json
{"schema":"sds.foundry.remote-owner-qa.v1","directory":"<Root private caller directory>","baseUrl":"https://samedaydesk.com/api/correspondence","expectedHostConfigId":"sha256:<actual allocation digest>","expectedEntryTermsHash":"sha256:<actual active entry terms digest>","authority":{"profileId":"<actual standing profile ID>","entryTerms":"sha256:<actual active entry terms digest>","contributionTerms":"sha256:<actual standing contribution terms>","scope":"synthetic-reusable-components"}}
```

Root explicitly authorizes actual activation/registration; this receiving package has performed none. Obtain the standing public entry metadata after Root's source/settings/private-path receiving and opt-in. Bind those exact values into the config; the canonical client refuses changed authority rather than guessing. Keep the original private enrollment; do not run installer/migrations as maintenance.

```sh
node server/foundry/activation/remote-private-journey.mjs a-contribute /absolute/private/caller.json
```

The canonical visitor enrolls A, writes a private correspondence checkpoint and contributes the existing pinned example. It writes `owner-observe-a.json` and a safe contribution receipt. Supply that one-line observation via hPanel, explicitly select `build:managed-foundry-private-pass`, and read the real verification ID. Then supply the exact dispatch request described above; run the same named build once. Require completed canonical publication, expected generation/module, existing budget charge and actual exit/drain evidence.

```sh
node server/foundry/activation/remote-private-journey.mjs a-use /absolute/private/caller.json
```

A uses useful, changed admitted input and useful-negative cases, and refuses unmeasured input. It writes an observation request for that project. Run that explicit read-only pass and save the exact final JSON result locally at 0600. Root restores normal managed build settings and controls/records the **actual HTTP process stop/start** at the same public origin. Do not call an ordinary build or a VM reboot proof of Hostinger restart. Write 0600 `<caller directory>/actual-http-restart.json` from actual hosting readback:

```json
{"schema":"sds.foundry.actual-restart.v1","receiptId":"<Root actual hosting restart/build receipt>","stoppedAt":"<actual UTC timestamp>","startedAt":"<later actual UTC timestamp>","expectedHostConfigId":"sha256:<actual allocation digest>","expectedEntryTermsHash":"sha256:<actual entry terms digest>"}
```

```sh
node server/foundry/activation/remote-private-journey.mjs b-use /absolute/private/caller.json
```

B enrolls independently at the unchanged origin, reacquires and uses the same canonical component for the three admitted cases, and refuses unmeasured input. A's private correspondence is resumed separately and stored locally without printing it. Supply `owner-observe-b.json` for one bounded read-only owner pass. Save its final JSON result and A's as a 0600 file `{ "a": <A control result>, "b": <B control result> }`.

```sh
node server/foundry/activation/remote-private-journey.mjs check /absolute/private/caller.json /absolute/private/control-readbacks.json
```

The offline check binds all six task/manifest/input/module/output witnesses to the same original source project/candidate/generation, actual current verification/runtime pin, canonical publication and exited/drained compile/instantiate/execute observations. It refuses changed/undrained readback. Its restart fact remains an explicitly labeled Root attestation; the caller does not independently inspect Hostinger. Keep these private receipts with the real build/restart readbacks. Remove only the maintenance request key via individual hPanel editing and restore normal build settings after receiving. No public execution endpoint, timer or retained worker is installed.

Primary control semantics: Hostinger's [build-settings model](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md) defines a package.json script name; supply `build:managed-foundry-private-pass`, not a shell command. Hostinger documents [individual hPanel environment edits/additions](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/). Neither source establishes permission for unsafe full environment replacement. Transaction locking follows [PostgreSQL row-lock semantics](https://www.postgresql.org/docs/17/explicit-locking.html); local files use the existing Node no-follow/exclusive-creation adapter and fsync, following [Node filesystem primitives](https://nodejs.org/docs/latest-v22.x/api/fs.html).
