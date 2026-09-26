# VF10 bounded public entry, v1

This optional adapter installs on the existing correspondence process and its
PostgreSQL namespace. It offers a finite **private correspondence** profile.
It does not create a user directory, work-cell store, runner, verifier, public
publication path, funding authority, or identity/reputation claim.

## Source reuse and boundary

`PostgresStore.createProject`, `createGrant`, `createEvent`, `revokeGrant`, existing
`findActiveGrantByTokenHash`, `requireGrant`, `requireProjectAccess`, and the actual
`createApp` remain the authorities. The module imports the existing grant/request
hashing, random IDs, schema/pool validation, `CorrespondenceClient`, bounded JSON
reader, and private-file helpers. No grant/project/event INSERT is duplicated.
The owner-only, non-idempotent earned-work issuance in
`packs/contributor-session-grant/src/owner.mjs` was inspected and is not public
entry. Its unresolved earned-work kernel is not used or modified.

Entry adds three tables: one immutable host/cohort installation, bounded
registration recovery records, and event-capacity reservations containing only
request identity/hash. Existing correspondence tables retain project, grant,
message and event replay authority. All entry mutations use explicit transactions
in the same validated schema; migration is an explicit host action.

`createEntryMount` returns `{app, entry, checkReady, close}` without listening,
migrating or installing. The caller must pass `enabled:true`, the same existing
Postgres store/database/schema/config, install the profile separately, and check
readiness. `close` closes entry's pool; the host separately closes correspondence.
Use the returned app in place of the original `createApp` at the existing prefix.
Every visitor event write must traverse this adapter's bounded store. Mounting a
second raw correspondence app for these grants would bypass its event quota.

## Public profile and HTTP

Under SDS the entry base is
`/api/correspondence/v1/visitor-entry`. The module's relative base is
`/v1/visitor-entry`. Schema/client contract: `neomorphic.foundry.entry.v1`.

| Method/path relative to entry base | Meaning |
| --- | --- |
| `GET /` | Public descriptor, exact immutable terms hash/profile, allowed/excluded authority, original-use/decline behavior, limits, receiver mode, current remaining enrollments. No credential or identity proof. |
| `POST /decline` | No credential, workspace, enrollment charge or stored refusal. Returns `declined`, `continue_original`. |
| `POST /register` | Exact persisted attempt plus local registration proof; reserves one slot and provisions/reconciles its project and grants. |
| `POST /reconcile` | Same proof/attempt, same scope; may finish incomplete provisioning, never another registration. |
| `POST /renew` | Same proof/attempt; refreshes the two existing grant rows up to the original workspace deadline. Revocation remains final for this registration. |

The three authenticated entry POSTs have exactly this body:

```json
{
  "schema": "neomorphic.foundry.entry.v1",
  "requestId": "random-local-request-id-at-least-16-characters",
  "profileId": "vf10:private-v1",
  "termsHash": "sha256:<exact installed descriptor terms hash>"
}
```

`Idempotency-Key` must equal `requestId`. `Authorization: Bearer <registration
secret>` is a canonical base64url encoding of 32 cryptographically random bytes.
This proof is distinct from project grants. It never belongs in a URL, body,
public descriptor, transcript or diagnostic. Use TLS except loopback testing.
Unknown body fields, including pseudonym, alias, project, role, limits, evaluator,
funding, shared-source authority and acceptance claims, are refused.

Response 200 has exact request/profile/terms binding, registration/project IDs,
workspace deadline, reader/writer credentials and expiry, `status:'ready'`, a
receiver state, and `nextAction:'use_private_correspondence'`. Ready describes the
private workspace. `receiver.state:'disabled'` does not mean foundry enrollment.
Response 202 is `status:'partial'`, receiver pending/unknown, and
`nextAction:'reconcile_same_attempt'`. The private correspondence grants are
usable while the separately committed internal receiving step is unresolved.
Receiver `declined` still permits the original private correspondence operation.
No response confers an owner grant or broader runtime authority.

Entry responses use `Cache-Control: no-store`. They reuse the existing CORS,
rate limiter, trust-proxy and body parser. Entry parser/rate-limit refusals are
projected to `{schema,error:{code,nextAction}}`, without reflecting raw input.
There is no logging of request bodies, headers, credentials or receiver errors.

| Refusal | Next action |
| --- | --- |
| 401 proof missing/mismatch | `restore_local_registration` |
| 409 attempt binding mismatch | `restore_exact_attempt` |
| 409 fresh profile/terms mismatch | `read_descriptor`; accept only within caller's standing scope |
| 409 cohort exhausted | `continue_original` |
| 401 grant expired | `renew_same_registration` |
| 403 revoked or 410 workspace expired | `continue_original` |
| 503 unknown mutation / bounded ingress busy | `reconcile_same_attempt`; never choose a new key |
| 403 work-cell/foundry scope excluded | `continue_original` |

Existing correspondence endpoints retain their existing response contract;
`visitor_workspace_limit` is a 409 with a concrete read/original-task next step
in `message`. The client must not treat it as authority to buy or enlarge scope.
The writer can append ordinary allowed events and read its project; reader cannot
write. Owner-only grant creation, resolution/reopening, and foreign-project
access remain guarded by unchanged correspondence code. Optional VF02/foundry
routes are denied to these visitor grants, including differently cased routes.

## Durable recovery and budget

1. Client saves `registration.secret` (0600) then `attempt.json` (0600), fsyncs
   both files through existing helpers and fsyncs the directory before POST.
   Lost state does not create an implicit right to another enrollment.
2. Under the singleton installation row lock, the server binds unique request ID
   **and** globally unique proof hash to exact profile/terms/body hash. One
   registration and its cohort charge commit before provisioning. Reusing the
   proof under a different key is a conflict. A guessed key never retrieves a
   token. Different secrets are different charged registrations, not independent
   people. New keys, aliases, expiry or revoked grants never refund the host cap.
3. Under a registration row lock, existing project bootstrap idempotency supplies
   exactly one project. Readback checks the stored request/owner hash before
   recovering its project ID, including after the base 24-hour replay window.
   A random owner-token preimage is discarded; the stored owner hash cannot be
   derived by the visitor. Privileged installed store methods remain host-only.
4. Reader/writer tokens use Node HMAC-SHA256 over a purpose-separated tuple of
   registration ID and role, keyed by the client's 32 random bytes. Existing
   `hashToken` is the only credential hash stored by correspondence. `token_hash`
   uniqueness and authenticated exact hash readback recover a grant committed
   before a lost reply. No server key directory or key-rotation escape exists.
5. Project, grant, receiver and recovery commits precede credential exposure.
   Separate store commits are **not** described as one atomic transaction.
   A crash can leave a charged registration with a project/grants but no recorded
   project link; the next exact attempt reads committed keys/hashes and finishes.
6. Each distinct event intent reserves one of `maxEvents` slots transactionally
   before calling existing `createEvent`. Its unknown or failed outcome retains
   the reservation. Exact retries reuse it and existing event idempotency.
   At most `maxEvents` event/idempotency rows can result. This closes the window
   where a connection loss could release a lock while a separate commit finishes.
7. Renewal authenticates the original proof and request, locks the same grants,
   rejects revocation, and updates only expiry to
   `min(originalWorkspaceDeadline, databaseNow + grantSeconds)`. It is a bounded
   lease refresh; repeated renew calls can refresh time within that fixed ceiling,
   not mint credentials, projects, event slots or receiver budgets. Register and
   reconcile do not renew implicitly. Old expired tokens fail ordinary readback
   until authorized renewal; revoked tokens are never restored.

The installation is immutable: same install is replayable, changing ID/limits or
receiver mode fails. There is one finite cohort per configured namespace. Default
sample profile: 32 enrollments, 32 event intents each, one-hour grants, seven-day
workspace lifetime. No automatic expansion/new cohort or operator-issued token
is needed on routine visits. Exhaustion is a real limit. This is budget accounting,
not Sybil resistance, and it cannot prevent an attacker consuming the finite cap.

Per process: 128 admitted registration handlers, 128 queued/active entry
transactions, pool default 2 (maintained config permits 1–4), 3s connection,
1.5s lock, 5s statement, 6s query and 15s idle-transaction limits. Correspondence
retains its separate existing pool. Profile validation caps host installations at
10,000 registrations, 1,000 event intents each, one-day grants and 30-day lifetime.
Host HTTP rate limits remain the first public ingress limit. These are source
bounds, not a production throughput promise.

## Optional internal receiver port

`receiver:null` is the default. An explicit trusted object may supply:

```js
{
  id: 'host:exact-installed-receiver-contract',
  async begin({ registrationId, projectId, signal }) { /* host-owned config only */ },
  async read({ registrationId, projectId, signal }) { /* return below */ }
}
```

`read` returns `pending`, `unknown`, `ready` or `declined` only after checking exact
registration/project/installed-config binding. `begin` cannot receive public
limits, evaluator, source-sharing, funding or runner configuration. The receiver
must enforce its own finite installed admission and execution budget.

Before `begin`, entry commits `receiver_started=true,state=unknown`. It invokes
begin at most once per registration, even after an exception, lost reply,
process restart, or 1-second wait deadline. Subsequent requests only call read.
Pending and unknown readback are persisted separately from the once-only marker;
terminal ready/declined cannot be overwritten by stale concurrent pending reads.
There is a separate 1-second deadline per port call and an abort signal. A timeout
bounds waiting, not remote execution; the receiving owner must honor cancellation
and own any physical capacity. A crash between marker commit and begin remains
unknown unless authoritative receiving readback resolves it. No expiry, missing
row or transient error authorizes repeating an unknown mutation.

The checked F93 `IntegrationStore.enroll(projectId,frozenExperiment,options)` is
owner-QA-specific and has no exported exact readback port. **It is not bound here.**
The fixture receiver in tests demonstrates this protocol with real durable rows,
not actual VF04 enrollment. Even a fixture `ready` does not widen v1 public scope.
See HEAVY-RECEIVING-PLAN for the required final VF04/VF05 contract work.

## Continuation and CLI

`attempt.json`, `continuation.json` and the optional `event-intent.json` contain no
raw proof or grant. They are still private files: event intent can contain private
text. `registration.secret` is deliberately secret and must be retained privately.
The client derives credentials in memory, uses existing `CorrespondenceClient`,
and prints only secret-free summaries. Resuming a read needs one authenticated
call and no chat transcript, descriptor request, or registration replay. Expiry
has the explicit same-registration renewal path. Losing the proof has no secretless
credential-recovery backdoor. See README for exact executable commands.
