# Recurring record-to-accepted-output journey

Turns one period of an existing ingestion record, bound Work Exchange terms, and a delivery into a buyer-accepted output, then replays that output in a later period. It reuses the job-contract runner. It adds no task, terms, ingestion, or results store.

Workflow Kits Nov12 owns the Make and n8n kits and the client adapters in SameDayDesk, and will code against the stable interface below.

## Normal consumer

The owner of one exact recurring record who must accept or reject a useful output in period N and compare it at period N+1, including exceptions and retries.

## How to rerun

From this directory, with no extra packages:

```bash
node --test recurring-journey.test.mjs
```

From the repository root:

```bash
node --test tools/payment-rail/recurring-journey/recurring-journey.test.mjs
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

## Later-period schema change fixture

The only later-period schema-change fixture is:

`tools/payment-rail/recurring-journey/fixtures/synthetic-later-period-schema-change.json`

Period N uses the retained permitted-capture payload fields `title`, `status`, and `output`. Period N+1 keeps the same capture schema name but renames `output` to `outputKeys`. The journey treats this as `schema_changed`: it does not auto-migrate, invent a new schema, or accept the period N output as the later period's result.

## Native versus Make or n8n comparison

Columns are `steps`, `failure handling`, `recovery`, and `duplicate effects`. Native is filled from this module. Make and n8n cells are left for Workflow Kits Nov12 to supply. They are not invented here.

| Column | Native (installed / direct) | Make | n8n |
| --- | --- | --- | --- |
| steps | 4: project permitted capture, bind the exchange-supplied termsVersion, build job contract, run acceptance | to be supplied by Workflow Kits Nov12 | to be supplied by Workflow Kits Nov12 |
| failure handling | typed exception per period: ingestion_missing, ingestion_incomplete, ingestion_not_permitted, capture_stale, schema_changed, terms_changed, token_used_as_task_ref, follow_up_not_new_task | to be supplied by Workflow Kits Nov12 | to be supplied by Workflow Kits Nov12 |
| recovery | replay with the same idempotencyKey (request digest) returns the original committed result; uncommitted first request fabricates nothing | to be supplied by Workflow Kits Nov12 | to be supplied by Workflow Kits Nov12 |
| duplicate effects | 0: secondEffect is false on replay | to be supplied by Workflow Kits Nov12 | to be supplied by Workflow Kits Nov12 |

The code exports the same values as `COMPARISON_ROWS`, with `make` and `n8n` set to `null` until Workflow Kits fills them.

## Exact input refs

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

Acquisition path: a cold caller can complete period N acceptance of a permitted record with bound terms, then replay the accepted output at period N+1 on a new follow-up task in the same context. Installed (native) acquisition is compared on useful results and integer amendment counts, not percentages. Hosted Make and n8n kit results are reserved for Workflow Kits.

What would change direction: if official VM tests show a second effect on digest replay, an auto-migration of the later-period schema-change fixture, or a token-shaped value accepted as a taskRef. Also if only owner QA appears and no unrelated consumer can rerun the artifact.

## What a cold caller can now complete

A caller holding the period N ingestion record, the Work Exchange task id and the sha256 termsVersion from the exchange preview or readAccepted result, and a delivery can obtain a buyer-accepted output and a rerunnable acceptance artifact keyed by the request digest.

## Which failure it recovers

A lost reply after the first committed effect is recovered by replaying the same request digest, with no second effect. An uncommitted first request does not fabricate an accepted output. A later-period schema change is reported as `schema_changed` rather than silently accepted.

## Which later caller benefits

Workflow Kits Nov12 can code Make and n8n adapters against the stable `period` field names and the comparison columns. A later period can replay the accepted output in the same `contextId` as a new follow-up task.

## Notes

This module keeps no local history that duplicates an authoritative task, terms, acceptance, or result store. Effect maps, terms hashes, and ingestion views are projections keyed to the authoritative request digest or the exchange-supplied termsVersion. A local hash of the caller-side terms document is not that authority. Fixtures are labelled synthetic. FlowAssert, if used later, is an external checker we consume, not a tool we claim to own. This branch does not adopt invented percentages or margins, treat a return ledger as a debt database, draw automatic credit or liability conclusions, freeze schemas, migrate MPP or Tasks, or assume customers. There is no customer-facing copy in this package.
