# Recurring record-to-accepted-output journey

Turns one period of an existing ingestion record, bound Work Exchange terms, and a delivery into a buyer-accepted output, then replays that output in a later period. It reuses the job-contract runner. It adds no task, terms, ingestion, or results store.

Workflow Kits Nov12 owns the Make and n8n kits and the client adapters in SameDayDesk, and will code against the stable interface below.

## Normal consumer

The owner of one exact recurring record who must accept or reject a useful output in period N and compare it at period N+1, including exceptions and retries.

## How to rerun

From this directory, with no extra packages:

```bash
node --test recurring-journey.test.mjs quote-continuity.test.mjs
```

From the repository root (this is the VM command):

```bash
node --test tools/payment-rail/recurring-journey/*.test.mjs
```

Local `node --check` and `node --test` on this host are preflight only. Official runs are on a Cursor VM via the VM Console.

## Stable interface

The idempotency key is the job-contract request digest (`requestDigest`). Replays after a first committed effect must send the same digest. An uncommitted first request does not fabricate a result.

Each period result exposes a `period` object with these stable field names. Workflow Kits adapters should read and write these names and should not invent a parallel ledger.

| Field | Meaning |
| --- | --- |
| `period.idempotencyKey` | The request digest. This is the idempotency key. |
| `period.recordEvidence` | Per-period record evidence: `taskId`, `contextId`, `followsTaskId`, `termsVersion`, `captureId`, `ingestionDigest`, `capturedAt`, and a non-authorizing `correlationId` when present. Bearer tokens never appear here. |
| `period.completeness` | `{ complete, missingFields }`. `complete` is false when the later-period record is missing agreed fields (`schema_changed`) or the ingestion is incomplete. |
| `period.exception` | `null` on success, or `{ code, message }` for a typed exception. Codes include `ingestion_missing`, `ingestion_not_permitted`, `capture_stale`, `schema_changed`, `terms_changed`, `token_used_as_task_ref`, `follow_up_not_new_task`, `ingestion_incomplete`, `continuation_file_missing`, and `uncommitted`. Retryable codes (`period.retry.retryable` is true) are exactly `ingestion_missing`, `capture_stale`, `ingestion_incomplete` and `uncommitted`. `ingestion_incomplete` and `schema_changed` also set `period.completeness.complete` to false. |
| `period.retry` | `{ retryable, sameIdempotencyKey, recovered, secondEffect }`. Retryable cases may be replayed with the same idempotency key. A recovered replay sets `recovered: true` and `secondEffect: false`. |

Caller examples: Work Exchange PR #463 (`epistemedeus/neomorphic-io` `ab7a3a0552e07ef5055ce48b442d7c0ee96bbaad`, `services/work-exchange/INTEGRATION.md` and `services/work-exchange/examples/recurring-job.mjs`; receipt `epistemedeus/pilot-heavy-relay@98f561e1ab3f75478da08f711b37af8fc9f04562`) supplies task id, sha256 `termsVersion` taken from the exchange preview or `readAccepted` result, and follow-ups as new tasks in the same `contextId`. A local `hashTermsVersion` of a caller-side terms projection is a consistency check only and never the authority; using it when it differs from the exchange value does not authorize and is `terms_changed`. Agent Entry PR #273 (`epistemedeus/x402-url-extractor@6c8edfd755d8e254659d9f8357c123c8da36bd44`, task-continuation 1.1.0) and `pilot-heavy-relay@3007012257ef1ca6adf75e0fa26afffde60124a7` `AGENT-ENTRY/` supply the `ae:corr:v1` `correlationId` shape. `publicView` carries no discovery; discovery is read only from a separate measurement record. A missing continuation file is the typed exception `continuation_file_missing`, not an empty success. `correlationId` and continuation tokens are non-authorizing.

### Owed reference (consume-only)

`owed-reference.mjs` reads an Agent Money owed reference and binds it to a journey. Source pin: `epistemedeus/pilot@527f69a8`, `tools/ops/agent-money/walletless-earned-claim.contract.mjs` lines 620 to 636. It creates no obligation, moves no money and signs nothing. Only synthetic references are accepted.

- `consumeOwedReference(ref)` accepts v1 (`pilot.agent-money.owed-reference.v1`, exactly `schema`, `synthetic`, `obligationId`, `taskRef`, `integrity`, `state`; reported `referenceDigest` is `null`) and v2 (the same keys plus `referenceDigest`).
- `owedReferenceV2Digest(ref)` is the sha256 hex, with no prefix, of `JSON.stringify({schema, obligationId, taskRef, integrity, state})` in that insertion order. It is not key-sorted. Do not use `request-contract.mjs` `canonicalJson` or `jsonBodySha256` for it; they give `6202d2b4...` instead of `212a845a...` on the pinned fixture.
- `bindOwedReferenceToJourney(ref, { correlationId })` requires `taskRef` to equal the journey's Agent Entry `correlationId` and returns `binding: { obligationId, taskRef, integrity, referenceDigest }`.
- `replayLaterPeriod` binds an optional `followUp.owedReference` with `correlationId = followUp.correlationId ?? periodN.caller?.correlationId ?? null` and carries `owedBinding` on the output. Without it the output is unchanged.

Refusal codes, all non-retryable (`retry.retryable` false; recover by presenting a corrected reference): `owed_reference_invalid`, `owed_reference_schema_unknown`, `owed_reference_keys_mismatch` (extra or missing keys), `owed_reference_not_synthetic`, `owed_reference_field_invalid`, `integrity_mismatch`, `owed_reference_unbound`. None joins the frozen period `RETRYABLE` set or `CONTINUITY_RETRYABLE`.

## Later-period schema change fixture

The only later-period schema-change fixture is:

`tools/payment-rail/recurring-journey/fixtures/synthetic-later-period-schema-change.json`

Period N uses the retained permitted-capture payload fields `title`, `status`, and `output`. Period N+1 keeps the same capture schema name but renames `output` to `outputKeys`. The journey treats this as `schema_changed`: it does not auto-migrate, invent a new schema, or accept the period N output as the later period's result.

## Native versus Make or n8n comparison

Columns are `steps`, `failure handling`, `recovery`, and `duplicate effects`. Native is filled from this module. Make and n8n cells come from Workflow Kits Nov12:

- Source: `epistemedeus/samedaydesk` branch `codex/n12-workflow-kits-20261112` at `806ebd9efe60b41943814bfb87bb293ea0d7fc9d`, `integrations/workflow-kits-n12/COMPARISON.json` (owner Workflow Kits Nov12). The comparison was first computed at the earlier commit `dc1179a7cf30446d0650d0ca94a5e210ad9f4389`; the file is byte-identical at `806ebd9e`. At `806ebd9e`, `integrations/workflow-kits-n12/vendor/PINS.json` still vendors this package at `175245e38f86431dcdfcf6607580e3af0b999d68` (PR #684) and the job contract at `fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e` (PR #682), with file hashes.
- VM run: the lead (dr eggbot, 2026-11-12) reports `806ebd9e` passed 115/115 node tests and all 3 producer checks on Root VM2, with the original record at `/home/ubuntu/n12-root-vm2-workflow-1144`. That record is not committed at this SHA (`IMPORTS.md` there records the earlier 113/113 run of kit `783f0841`). Passing is source and import acceptance, not commercial acceptance.
- Method: the Make and n8n numbers are computed from the committed blueprint and workflow JSON by `scripts/compute-comparison.mjs`, plus a local lost-reply simulation through the client endpoint. They are not live Make or n8n runs.

| Column | Native (installed / direct) | Make | n8n |
| --- | --- | --- | --- |
| steps | 4: project permitted capture, bind the exchange-supplied termsVersion, build job contract, run acceptance | 7 modules on the accepted path (11 in the scenario) | 7 nodes on the accepted path (15 in the workflow, 3 of them the FlowAssert branch) |
| failure handling | typed exception per period: ingestion_missing, ingestion_incomplete, ingestion_not_permitted, capture_stale, schema_changed, terms_changed, token_used_as_task_ref, follow_up_not_new_task, continuation_file_missing | 3 router routes with filters (Accepted, Retryable, Not retryable), plus typed `period.exception.code` from the client endpoint | 2 If nodes and 3 response outcomes (200 accepted, 202 replayed, 422 exception), plus typed `period.exception.code` from the client endpoint |
| recovery | replay with the same idempotencyKey (request digest) returns the original committed result; uncommitted first request fabricates nothing | 3 modules on the retry route, replaying with the same idempotencyKey | 3 nodes on the retry route, replaying with the same idempotencyKey |
| duplicate effects | 0: secondEffect is false on replay | 0 (2 evaluations gave 1 acceptance effect; 2 hand-off posts gave 1 delivery) | 0 (same measurement) |

Caveat: duplicate protection comes from the request-digest idempotency key at the client endpoint, not from Make or n8n. A platform retry that bypasses the endpoint is not deduplicated.

Hosted imports:

- n8n: the Cloud QA import passed. The workflow was created, read back exact (15 nodes, inactive, no credentials) and deleted afterwards. Nothing was executed. Reported by the lead (dr eggbot, 2026-11-12). Receipt: `epistemedeus/samedaydesk@806ebd9efe60b41943814bfb87bb293ea0d7fc9d` `integrations/workflow-kits-n12/IMPORTS.md`, section "n8n Cloud QA import, received". The imported workflow is from kit `783f0841d56a44acd4dcce1b5a29a5060e04824b`, the parent of `806ebd9e`.
- Make: not imported yet. Nothing was created in Make. Same receipt file.

An import receipt is import, readback and cleanup only. It is not an executed hosted workflow and not paid or commercial acceptance.

The code exports the same values as `COMPARISON_ROWS`, and the source, method, caveat and import receipts as `COMPARISON_SOURCE`.

## Exact-request quote and delivery continuity

`quote-continuity.mjs` follows CLI revision 3 (`epistemedeus/pilot@e597252f`, `THREE-SITE-AGENT-CLI-PLAN.md` "Agent-native runtime contract" item 6 and `INTEGRATED-DECISIONS.md` "Revision3"). Adjudication pin: `epistemedeus/pilot@0d9eed5f7b949f71767724cbf3d72ac55ad3dbb2`. Base: PR #684 at `175245e38f86431dcdfcf6607580e3af0b999d68`.

Three distinct records:

| Record | Made by | Binds to | Authority |
| --- | --- | --- | --- |
| local preview (`useful-commerce.local-preview.v1`) | `buildLocalPreview` | request digest; reports intended effects | none; no network dispatch, no quote id, no expiry |
| remote quote (`useful-commerce.remote-quote.v1`) | the remote | exact request digest and `termsVersion`; declares its effect and actual expiry | synthetic only: unsigned, `amountAtomic` `"0"` |
| reservation (`useful-commerce.reservation.v1`) | the remote | one quote id and its request digest | synthetic only |

A preview never stands in for a quote. That includes a Work Exchange preview record: it supplies `termsVersion`, but it is not a quote.

Before any dispatch that could be lost, `prepareDispatch` persists a minimal nonsecret recovery record (`idempotencyKey`, `requestDigest`, `termsVersion`, `quoteId`, `quoteExpiresAt`, `reservationId`, `intendedDispatch`, `persistedAt`) to an injected store and reads it back. `sendPersistedDispatch` dispatches only from that record. After a lost reply, `recoverDispatch` reads the record, possibly in a fresh process, and replays with the same idempotency key. It returns the original committed result with no second effect, or the typed `uncommitted` state with no result. If the record was never persisted, nothing was dispatched and recovery returns `recovery_record_missing`.

There is no exactly-once promise. Every result carries `exactlyOnce: false`. A failure after sending does not prove no effect occurred, which is why a lost reply is `dispatch_outcome_unknown` rather than a failure. Retention expiry, ambiguous absence and host or storage loss remain honest limitations. The store and the remote are injected. This module does no real IO and keeps no authoritative ledger.

Typed codes (`exception.code`):

| Code | Meaning | Retryable |
| --- | --- | --- |
| `preview_used_as_quote` | a local or exchange preview was presented as a quote | no |
| `quote_not_synthetic` | quote is signed or nonzero; no live payment or signing here | no |
| `quote_request_mismatch` | quote is bound to a different request digest | no |
| `quote_terms_mismatch` | quote is bound to a different `termsVersion` | no |
| `quote_expired` | quote expired before dispatch | yes, with a fresh quote |
| `reservation_without_quote` | reservation missing, or not bound to the presented quote | no |
| `recovery_store_unavailable` | the recovery record could not be persisted; nothing dispatched | yes |
| `recovery_record_missing` | dispatch or recovery attempted without a persisted record; refused | no |
| `dispatch_outcome_unknown` | reply lost after the record was persisted | yes, through `recoverDispatch` with the same key |
| `uncommitted` (existing) | recovery found no committed effect; nothing fabricated | yes, as before |

The new retryable codes are in `CONTINUITY_RETRYABLE`. The frozen period `RETRYABLE` set in `journey.mjs` is unchanged, and a test checks that no new code joins it. The `period` stable interface is unchanged.

VM command, from the repository root:

```bash
node --test tools/payment-rail/recurring-journey/*.test.mjs
```

## Exact input refs

- CLI revision 3: `epistemedeus/pilot@e597252f` (`THREE-SITE-AGENT-CLI-PLAN.md`, `INTEGRATED-DECISIONS.md`)

- Assignment pin: `epistemedeus/pilot@a243f12b1dde8ce172b09945ee15d23aecdd986e`
- Adjudication pin: `epistemedeus/pilot@0d9eed5f7b949f71767724cbf3d72ac55ad3dbb2` (INTEGRATED-DECISIONS revision 2). Programme unchanged: record-to-accepted-output, exceptions, and later-period replay on existing ingestion/results.
- CLI plan ref: `epistemedeus/pilot@c64ad7bcd84b91add5e2eed621bc70bdbb41c026`
- Job-contract parent: `epistemedeus/pilot@fb8228a90a3f12221451ab27a3c9dc9eccc5ab6e` (PR #682)
- Work Exchange PR #463 caller source: `epistemedeus/neomorphic-io@ab7a3a0552e07ef5055ce48b442d7c0ee96bbaad` (`services/work-exchange/INTEGRATION.md`, `services/work-exchange/examples/recurring-job.mjs`). Receipt: `epistemedeus/pilot-heavy-relay@98f561e1ab3f75478da08f711b37af8fc9f04562`.
- Agent Entry: `epistemedeus/x402-url-extractor` PR #273 head `6c8edfd755d8e254659d9f8357c123c8da36bd44` (task-continuation 1.1.0); earlier cited head `578396b62df736db397d33826e627071875e864d`; receipt `epistemedeus/pilot-heavy-relay@3007012257ef1ca6adf75e0fa26afffde60124a7` `control/plan/N12-PARTICIPANT-ECONOMY/AGENT-ENTRY/`
- Ingestion: `epistemedeus/samedaydesk@32437117e5232480b18349721069b2a8a0fc2a2c` `tools/recurring-decision-consumer/`
- Results: `epistemedeus/samedaydesk@32437117e5232480b18349721069b2a8a0fc2a2c` `tools/result-reuse/`

The paid-API release-acceptance corpus at the job-contract pin has no Make or n8n fixture files. This branch does not contact Make or n8n bidders and does not touch pending bids.

## Acquisition path and what would change direction

Acquisition path: a cold caller can complete period N acceptance of a permitted record with bound terms, then replay the accepted output at period N+1 on a new follow-up task in the same context. Installed (native) acquisition is compared on useful results and integer amendment counts, not percentages. Hosted Make and n8n kit results are owned by Workflow Kits and cited above.

What would change direction: if official VM tests show a second effect on digest replay, an auto-migration of the later-period schema-change fixture, or a token-shaped value accepted as a taskRef. Also if only owner QA appears and no unrelated consumer can rerun the artifact.

## What a cold caller can now complete

A caller holding the period N ingestion record, the Work Exchange task id and the sha256 termsVersion from the exchange preview or readAccepted result, and a delivery can obtain a buyer-accepted output and a rerunnable acceptance artifact keyed by the request digest.

## Which failure it recovers

A lost reply after the first committed effect is recovered by replaying the same request digest, with no second effect. An uncommitted first request does not fabricate an accepted output. A later-period schema change is reported as `schema_changed` rather than silently accepted.

## Which later caller benefits

Workflow Kits Nov12 can code Make and n8n adapters against the stable `period` field names and the comparison columns. A later period can replay the accepted output in the same `contextId` as a new follow-up task.

## Notes

This module keeps no local history that duplicates an authoritative task, terms, acceptance, or result store. Effect maps, terms hashes, and ingestion views are projections keyed to the authoritative request digest or the exchange-supplied termsVersion. A local hash of the caller-side terms document is not that authority. Fixtures are labelled synthetic. FlowAssert, if used later, is an external checker we consume, not a tool we claim to own. This branch does not adopt invented percentages or margins, treat a return ledger as a debt database, draw automatic credit or liability conclusions, freeze schemas, migrate MPP or Tasks, or assume customers. There is no customer-facing copy in this package.
