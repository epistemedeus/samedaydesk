# VF02 v1 contract

Canonical exported validators/types: `commandSchema`, `gapSchema`,
`checkpointSchema`, `contributionSchema`, `verificationSchema`, `Cell`,
`MutationReceipt`, `ReceiptResolver`, `WorkCellError`, `cellIdFor` from
`services/correspondence/src/visitor-work-cells/index.ts` (built `.js` equivalent).
All inputs are strict: unknown fields are errors. Monetary/funded/execution
fields are absent and rejected. HTTP timestamps are UTC ISO/RFC3339; the server
uses PostgreSQL `clock_timestamp()` for lease decisions. Reference digests are
`sha256:` plus 64 lowercase hex. Reference `uri` is HTTPS, at most 2048 characters,
with no userinfo. References are never fetched or executed by this module.

## Scope and access

A cell is unique on `(projectId, gap.id, workScope)`; its ID is
`wcl_` plus the stable SHA-256 of that tuple using existing `hashRequest`.
Changing a gap contentId requires a new declared workScope, not in-place editing.
Projects are correspondence's tenant boundary; this module does not infer an
organization/tenant beyond that existing boundary. Grants retain owner/writer/
reader roles. All grant validation happens in the same DB transaction as the
operation. Active grants are locked FOR SHARE, so revocation is ordered against
operations; expiry is checked after cell lock waits and before commit. Another
project's valid grant gets 404. Invalid/revoked/expired grants get 401. Readers
can inspect snapshots/replay but cannot mutate. Owners can reject/cancel;
contributors can cancel their own live lease (with fence) or submitted candidate.

Lease sessions are grant IDs, never caller-supplied display names. A fresh session
requires a newly authorized correspondence grant. A shared bearer is the same
session. Grant IDs and alternate identities do not establish independent humans.

## HTTP

Prefix below is `/v1/projects/:projectId/work-cells`.

| Method/path | Body/result |
| --- | --- |
| POST prefix | `create` command, `Idempotency-Key` required |
| POST prefix/:cellId/commands | One of the other commands, same header contract |
| GET prefix/:cellId | `{cell, leaseLive, observedAt, nextStep}` |
| GET prefix/:cellId/receipts?limit=25&after=CURSOR | Bounded per-cell committed receipts |

Committed mutation: 201 with `{receipt,replayed:false,nextStep}`. Exact retry:
200 with the original `{receipt,replayed:true,nextStep}`. `receipt` schema is
`neomorphic.foundry.work-cell-receipt.v1` and contains action, revision,
actorGrantId, recordedAt, historical cell snapshot and nextStep. No tokens.
The top-level retry nextStep explicitly requires a fresh GET before reusing an
old receipt's revision/lease. Auth is still required before historical replay.

All commands contain `schema: "neomorphic.foundry.work-cell-command.v1"`,
`action`, and mandatory `expectedRevision`. Create requires 0; every committed
transition increments revision once. Counter bound is 2,147,483,646. Only committed
mutations reserve keys; validation errors/conflicts are rolled back. A key is
8–200 characters, trimmed, scoped to cell/project, and bound to canonical parsed
command plus acting grant ID. Body order is immaterial. Another operation/body/
expectedRevision/grant using a committed key gets 409 idempotency_conflict.
Exact retry is checked before revision/status/fence tests, never before auth.
Keys and receipts have no automatic expiration; deleting keys permits duplicate
side effects and is not an approved retention strategy.

| Action | Additional required fields | Transition and authority |
| --- | --- | --- |
| create | gap, workScope | owner/writer, open, revision 1 |
| claim | ttlSeconds, voluntaryOptIn:true | open or expired/revoked leased → leased; new fence |
| renew | fence, ttlSeconds | live holder; same fence, new bounded expiry |
| checkpoint | fence, checkpoint | live holder; durable checkpoint pinned to resulting revision |
| transfer | fence, targetGrantId, ttlSeconds | live holder with checkpoint; different active same-project writer/owner; new fence |
| release | fence | live holder → open; checkpoint retained |
| submit | fence, contribution | live holder → submitted; lease released; exact checkpoint/gap bindings |
| cancel | reason; fence for live nonowner holder | → cancelled; terminal; provenance distinguishes owner/contributor |
| reject | reason | owner → rejected; requester rejection, not verifier observation |
| disposition | receipt (immutable reference) | owner + trusted resolver; submitted → accepted/rejected, or deferred (still submitted) |

TTL is integer 1–900 seconds, always capped by the receiving grant's expiry.
Every claim/takeover/transfer increments the monotonically retained fence.
Renew/checkpoint/release/submit require current actor, fence and unexpired lease.
A lease whose holder is revoked is no longer live even if its time remains.
The target grant must be issued for the intended handoff by the project owner;
transfer conveys no payment obligation. Each visitor's claim is explicit opt-in.
Terminal cells cannot be reopened; use a new scope after examining disposition.
Resolved correspondence projects refuse create/claim/renew/checkpoint/transfer/
submit, but permit release/cancel/reject/disposition. Correspondence owner
reopen remains the authoritative operation. Work cells never resolve projects.

## VF01 gap and contribution seam

`gap` has schema `neomorphic.foundry.work-cell-gap.v1`, canonical namespaced `id`, digest
`contentId`, artifact refs `resolverSnapshot` and `reproducer`, `permission`
(`synthetic` or `authorized-reusable`), and `fundingKind` (`voluntary` or
`unfunded-request`). No `funded` input is accepted here. Funding never changes
on claim, submission or acceptance. VF01 is responsible for validating its own
resolver result and reproducer rights before projecting this smaller envelope.
The stored declaration is provenance, not proof that permissions were verified.
Workflow IDs/workScope allow ASCII letters/digits plus `:._/-`, max 160 characters. Gap IDs use the full canonical VF01 512 UTF-16 code-unit domain. `contribution.gapRevision` means the immutable gap contentId. See the receiving [wire schema](../integration/wire/README.md). Valid wire strings PostgreSQL cannot preserve (NUL/lone surrogates) return explicit HTTP 422 unsupported without partial mutation.

`checkpoint`: schema `neomorphic.foundry.checkpoint.v1`, artifact ref, summary,
nextStep (each 1–2000 chars). Server adds revision, grantId, createdAt. Transfer
and expired-lease takeover retain this exact checkpoint; no transcript is needed.

`contribution`: schema `neomorphic.foundry.contribution.v1`, gapId, gapRevision,
sourceRevision (digest of immutable source revision descriptor), artifact ref,
rights, testProposal, operatorScope (each 1–2000 chars), limitations (0–2000),
checkpointRevision (positive integer). A Git commit can be preserved in the
referenced descriptor; a bare mutable branch is insufficient. All are data.
Server adds submission id/revision/grantId/submittedAt and contributor grant IDs
that checkpointed/submitted (at most 32). The contribution may propose tests;
it grants no authority to run arbitrary submitted code.

## VF03 receipt seam

`ReceiptResolver({reference, projectId, cellId, submission, signal})` is an
in-process host dependency for looking up an already independently admitted
immutable receipt. It must validate receipt reference/digest, execution identity
assignment, provenance and policy via VF03's authority. VF02 does not authenticate
a URL's contents, schedule verification, validate arbitrary code or make network
fetches. Do not map a caller-supplied JSON receipt directly to this resolver.
Default absent resolver: 503 verification_unconfigured; candidate stays submitted.
The lookup is capped at 750ms and aborts via signal; adapters must obey abort and
must not start unbounded background work. Exact mutation replay bypasses lookup.

The trusted output uses `neomorphic.foundry.verification-receipt.v1`:
`id`, `projectId`, `cellId`, `submissionId`, `candidateRevision`, `artifactDigest`,
`executionIdentity`, `evaluatorPolicy` artifact ref, `environment`,
`independentlyAssigned:true`, `contributorRelationship` (`independent`,
`owner-controlled`, `unknown`), `outcome` (`accepted`, `rejected`, `deferred`),
`limitations`, `nextStep`, optional retryAfterSeconds (1–86400). String bounds
follow the exported schema (IDs max 160, prose max 2000).

VF02 checks exact project/cell/submission/source/artifact bindings, rejects an
execution identity equal to a recorded contributing grant, and rejects a
contributing owner grant attaching its own disposition. Different aliases alone
cannot establish independence: trusted VF03 assignment remains essential.
Acceptance records this work-cell candidate disposition only. It neither
publishes/promotes a capability nor establishes useful reuse, payment, or later
continued validity. VF03 owns later revocation/invalidation and promotion.

## Replay, contention and errors

Replay schema `neomorphic.foundry.work-cell-replay.v1`: receipts, hasMore,
throughRevision, nextCursor. Limit 1–50, default 25. Cursor reuses correspondence
opaque encoding with project AND cell in its scope. Existing keys carry the
receipts; one additive partial index orders integer revisions. No new event
journal. `throughRevision` bounds each page against commits seen at page start;
a later page may include newly committed revisions. Cursors are scoped, not signed
or privileged. There is no total-history export without a caller-selected bound.
Nonempty pages return a resume cursor; empty pages retain the prior cursor.

Projection rows serialize only one cell. Project/grant FOR SHARE locks are
compatible between independent cells; project lifecycle transitions and grant
revocation intentionally wait. There is no all-to-all broadcast or global
mutation advisory lock. A schema advisory lock is used only during migration.

| HTTP/code | Required next step |
| --- | --- |
| 400 invalid_input / invalid_cursor | repair command or use correct scoped cursor |
| 401 unauthorized | obtain fresh scoped grant; old identity retries stay forbidden |
| 403 forbidden / invalid_target_grant / self_disposition | use actual required authority; do not relabel a session |
| 404 not_found | use the project/cell authorized by the grant |
| 409 revision_conflict | GET/reconcile intent, new key with current revision |
| 409 idempotency_conflict | recover original key/body/grant; new intent gets new key |
| 409 lease_held | Retry-After expiry, then GET; another holder may have renewed |
| 409 stale_fence | stop stale work; GET and claim only when authorized/available |
| 409 candidate_mismatch / receipt_mismatch / invalid_receipt | correct exact binding; request proper independent receipt |
| 409 checkpoint_required / verification_pending / not_submitted | checkpoint, await verification, or submit respectively |
| 409 project_resolved / terminal_cell / cell_exhausted / handoff_limit | owner reopen or explicitly new scope as indicated |
| 413 payload_too_large | command <=24KiB; store immutable refs |
| 503 busy / unavailable / verification_busy | same-key/body retry with jitter; ambiguous network/commit outcome is unknown |
| 503 verification_unconfigured | wire trusted VF03 receipt lookup; preserve submitted status |

Successful receipts never imply an unexpired current lease. Transport timeouts
cannot prove rollback. Client attempt/reconcile persists exact target/command/key
before POST, refuses foreign origin/project/grant reuse, bounds responses to 2MiB,
and forbids HTTP redirects. It reuses correspondence origin rules and
contributor-session-grant secret-file helpers. Do not persist private visitor
inputs inside commands; this data is visible to authorized project readers.
