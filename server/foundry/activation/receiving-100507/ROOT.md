# Original A: discriminating the serving recovery failure

Receive the single exported commit from `d9025af2cffc38a5d6eb551fe20ac9d99c45704c`, then select the existing package script name **`build:managed-foundry`** for normal source delivery. This diagnostic does not repair an inferred Hostinger filesystem/schema defect. No installer, migration, transition, generation renewal, reset, new registration or owner recovery action is introduced. Preserve existing environment values, opt-in, original private enrollment and `CORRESPONDENCE_PGSSL_CA_FILE` pointing at the already verified private `prod-ca.pem`; retain DNS hostname and verify-full. Use individual hPanel keys only; no full-replacement environment PUT or multiline PEM edits.

Continue the existing saved A, using Root's existing 0600 owner configuration and continuation files:

```sh
owner_config=/absolute/path/to/existing-1005-owner-config.json
node server/foundry/activation/remote-private-journey.mjs a-reconcile "$owner_config"
```

Require registration `ven_LN-0OoD1GHnf_iur` and project `prj_5cboYklXAf5S8Gio`. Exit 2 / HTTP 202 remains partial; transport loss remains unknown. Neither outcome authorizes another attempt. If the grant has expired, canonical renewal uses the same saved visitor configuration/proof/attempt, within the original workspace deadline, before reconciliation:

```sh
visitor_config=/absolute/path/to/existing-visitor-a.config.json
node vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/visitor.mjs renew "$visitor_config"
node server/foundry/activation/remote-private-journey.mjs a-reconcile "$owner_config"
```

After that bounded receiving pass has ended, explicitly select **`build:managed-foundry-private-pass`** with the unchanged existing read-only request through its private environment/file adapter:

```json
{"schema":"sds.foundry.private-pass.v1","intentId":"root-observe-entry-a1005","action":"observe","projectId":"prj_5cboYklXAf5S8Gio","expectedHostConfigId":"sha256:c7938fd96a127f6394f800312ea50dfe1d2e7b07d59e2b65f81a66353e59bf4d","expectedEntryTermsHash":"sha256:ef3d1d1c68de03dba316d097f43e69ed2e190da2b86e270f82f9c5ae158b40b5","expectedVerificationId":null,"candidateId":null,"expectedGeneration":null,"reconcileIntentId":null}
```

Read **`readback.entry.progress.phases`** from the newly executed serving reconciliation, particularly `recover`'s `outcome`, `code`, `errorClass`, `sqlState`, `stage`, `resource`, and `budgetExpired`. The trace is the last bound snapshot, not an append-only log: retain its dated private result. A missing/old trace or a durable plan without completed phase observations cannot identify the latest failure. Unchanged conservative receiving/SQL-cleanup budget is 28s: 20s receiving + 3s acknowledgment + existing 5s server-statement cleanup, after proof/grant binding. Client reply deadline remains 10s; response loss does not stop an owned operation or release ownership.

| New serving evidence | What it distinguishes |
| --- | --- |
| `filesystem_missing`, `portable_policy`, `runtime_config` | The actual lazy installation read could not open its expected venv configuration. This does not identify why the host delivered that layout. |
| Filesystem alias + `interpreter`, `wasmtime_bindings`, `wasmtime_native`, `launcher_source` | The failing operation names a closed installed-resource category. No pathname is exposed or preflight substituted. |
| `validation_failed`, `portable_policy` | The installed-policy contract refused; no arbitrary validation message is disclosed. |
| SQL alias / enumerated SQLSTATE at `pool_insert` or `experiment_insert` | The corresponding canonical write failed; pending ownership survives rollback. No SQL, arguments, table/constraint names or prose is returned. |
| `installed_source_changed`, `portable_verification` | The installed source changed after module binding. |
| `receiver_transaction` / `receiver_authority` / `admission_read` | Failure before portable enrollment or at transaction setup/commit. |
| `port_error` / unknown class | Still undiagnosed; do not infer a filesystem or schema cause. |

The observer's **current** `receiverState`, `poolReady`, and verification check are evaluated in the explicit build/private-pass process. They cannot prove the serving process has the same runtime resources. Its retained `progress` comes from the serving reconciliation; the harness demonstrates these contexts can disagree. Require actual A HTTP 200 / ready before contribution, plus subsequent actual invocation/termination witnesses. A phase tag/error alias is diagnostic, never verification or execution evidence.

Return that safe trace to source receiving if it still fails. No operator SQL/schema repair or runtime relocation is prescribed without its identified owning cause. Unknown physical work remains held. After actual A becomes ready, continue the saved `a-contribute`, controlled verification/publication/use, actual HTTP restart, B same-candidate acquisition/use and exited/drained observations from [100504](../receiving-100504/ROOT.md). Actual Hostinger closure remains Root's work.

Primary semantics: [PostgreSQL SQLSTATE](https://www.postgresql.org/docs/17/errcodes-appendix.html), [Node system error codes](https://nodejs.org/docs/latest-v22.x/api/errors.html#common-system-errors), [node-postgres parameter serialization](https://node-postgres.com/features/queries), [managed build script names](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1NodeJsUpdateBuildSettingsRequest.md), [individual hPanel environment edits](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/).
