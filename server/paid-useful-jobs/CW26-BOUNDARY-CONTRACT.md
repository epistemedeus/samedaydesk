# CW26 execution and delivery boundaries

This is a source-only repair of the existing execution.v1 adapter, managed-order
consumer and mailbox. It adds no engine, purchase authority, settlement or service.

- HTTP execution IDs bind canonical frozen request bytes. Identical in-flight
  retries coalesce. Changed requests conflict. Exceptions remain recorded as
  unknown outcomes and do not silently rerun under the same key.
- HTTP bodies default to 8 MiB, IDs to 128 safe characters, and the replay map to
  1,024 admitted keys. Results expire after 24 hours by default. Expiry keeps a
  tombstone; a full map refuses new execution. Limits can be configured in
  createExecutionServer. This cache is process-local, not restart-persistent
  idempotency. A restart loses its keys. Durable order/mailbox records are separate.
- Managed orders freeze the bytes whose hashes entered order terms, reject
  conflicting fileBytes overrides, and preserve exact Buffer bytes through the
  existing HTTP contract. This does not turn input-root directory handling into
  a transactional filesystem snapshot.
- A successful execution response must match the order's job, execution ID,
  contract and engine pin. Outer and nested delivery must be complete and
  transport-successful. Exact catalog output names and byte digests must agree.
  Contradictory responses become stored refusals, including on replay.
- Mailbox admission validates nested execution identity and actual output bytes.
  A request slot binds immutable provenance, expiry and sample terms as well as
  artifact bytes. Acknowledgment progress remains mutable.
- Mailbox artifact publication stages a complete generation in a hidden sibling
  directory, then renames it into the request slot. A concurrent different
  generation conflicts. A killed writer leaves no visible partial slot; its
  hidden orphan stage does not block a later writer. An older nonempty incomplete
  slot is preserved and refused, not overwritten.
- This is same-filesystem process-crash atomicity in a trusted local filesystem,
  not a cross-filesystem transaction, power-loss/fsync guarantee or multi-tenant
  path sandbox. Task-created test stages are removed; production crash orphan
  stages require separately scoped cleanup.
- The atomicity consumer refuses execution.v1 receipts that explicitly declare
  failed transport or incomplete delivery, even when listed files hash correctly.
  Legacy receipts without execution.v1 remain supported.

## Remote verification

Run with NODE_OPTIONS=--max-old-space-size=768 and --test-concurrency=1:

    node --test --test-concurrency=1 \
      server/paid-useful-jobs/test/*.test.mjs \
      tools/result-mailbox/test/*.test.mjs \
      tools/managed-useful-jobs-order/test/*.test.mjs \
      tools/job-output-atomicity/test/*.test.mjs \
      tools/job-input-preflight/test/*.test.mjs

CW26 adds 29 regression cases. The 16-case process/mailbox harness had 15 failures
on inherited source; its SIGKILL retry case already passed. The 13-case
managed-order harness had 13 failures before its fixes. Repaired combined scoped
suite: 265 passed, zero failed/skipped. These counts describe regression cases,
not 28 independent vulnerabilities. Actual Node ESM executable entrypoints,
HTTP sockets and independent seed processes are exercised; no compile step is
required by these entrypoints.
