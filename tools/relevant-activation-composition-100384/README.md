# Relevant activation caller

SPDX-License-Identifier: MIT

Node 22+, no install. This profile retains an actual supplied SDS readiness
task, and reads EIN's existing catalog only when scoped operator and provider
facts establish a new-entity need. A website, API, wallet, or goal description
cannot qualify the caller. Existing entities and EIN-only needs get useful
no-purchase actions. An ambiguous path asks for one missing fact.

The profile sends free SDS supplied-row checks and read-only EIN discovery or
grant-scoped status. It never runs EIN assess, prepare, claim, payment, legal
attestation or enrollment. The operator may independently use the acquired
EIN client for an actual qualified task. SDS and EIN homepages are unchanged.

Each fact contains its exact value, source URI/locator, and operator or
provider authority bound to the original task and recipient. The goal's
intent is an explicit operator fact, not text classification. These are
supplied assertions, not provider-document certification. `examples/` are
owner-QA inputs; replace them with the actual caller's records for real work.

From this profile directory (or an exported archive):

```sh
umask 077
export SDS_ACTIVATION_RECIPIENT_ID=qa-operator-384
export EIN_CONTINUATION_TASK_ID=qa-supplier-384
export EIN_CONTINUATION_CUSTOMER_KEY=qa-caller-key-sol384
export EIN_CONTINUATION_INTENDED_EMAIL=owner@example.test
export EIN_ACTIVATION_BASE_URL=https://ein.llc
export EIN_CONTINUATION_FILE=/tmp/sol384-ein.private.json
node bin/sds-activation.mjs plan < examples/qualifying.json > /tmp/sol384-plan.private.json
```

The printed result is a private caller packet. It contains the retained
readiness result, exact repair/recheck body, and the existing client's next
legitimate action with the exact assessment input. **Plan did not assess.**
For a real task, the operator reviews those facts and independently runs the
existing `ein-continuation.mjs assess` then `prepare`. Keep that client's
original continuation file, task id, customer key and intended email. Do not
start another case to recover a lost reply: the existing client's `resume`
replays the same bound operation. An uncertain assess requires its existing
explicit reassessment decision.

Caller command inputs are `{ "task": ..., "checkpoint": ... }`. To continue,
retain `task` from the original input and `checkpoint` from the last result:

```sh
node bin/sds-activation.mjs handoff < /tmp/sol384-next.private.json
export EIN_AGENT_GRANT_FILE=/path/to/operator-issued-status.grant
export EIN_AGENT_GRANT_ORIGIN=https://ein.llc
node bin/sds-activation.mjs return < /tmp/sol384-next.private.json
node bin/sds-activation.mjs cancel < /tmp/sol384-next.private.json
```

`handoff` points at the exact claim field in the original private EIN file
and repeats its scoped operator action. It copies no claim credential into
the checkpoint. Only the original recipient can receive that link. `return`
requires a fresh existing status grant; a caller `done` flag is refused.
Claimed/quoted status observes the operator's action and returns the retained
readiness task, while formation remains unfinished. Fulfillment and payment
are reported only as the existing status says. Provider approval and useful
customer delivery remain unknown. Cancellation changes only the caller's
checkpoint; it does not cancel an EIN case or revoke the operator's grant.

No-purchase examples:

```sh
EIN_CONTINUATION_TASK_ID=qa-existing-384 node bin/sds-activation.mjs plan < examples/existing-business.json
EIN_CONTINUATION_TASK_ID=qa-ambiguous-384 node bin/sds-activation.mjs plan < examples/ambiguous.json
EIN_CONTINUATION_TASK_ID=qa-technical-384 node bin/sds-activation.mjs plan < examples/technical.json
```

Only a pending clarification permits supplied prerequisite facts to change
under the same goal and readiness task. Once qualified, changed goals,
facts, recipients, callers, origin, transport or terms stop continuation.
The checkpoint is not authority: return always reads the original EIN file
and the backend's status with the existing grant.

Whole command budget (stdin, SDS discovery/check, EIN discovery/status):
`SDS_ACTIVATION_DEADLINE_MS` (50–60000; default 15000) and
`SDS_ACTIVATION_MAX_RESPONSE_BYTES` (1–4194304; default 1048576).
Input is at most 32 KiB; output at most 64 KiB. SIGINT aborts the current
command. The backend tests run only an isolated actual EIN175 backend, with
test auth and a disposable file store. They use its existing telemetry.

```sh
node --test test/unit.test.mjs
SOL384_EIN_SOURCE=/path/to/exact/ein175 node --experimental-strip-types --test test/backend.test.mjs
node scripts/public-readback.mjs
node scripts/pack.mjs
```

The public readback calls no production formation mutation. Readiness QA,
downloads and HTTP 200 establish no customer demand, payment or savings.
Catalog price text is returned verbatim only to a qualified task; state fees,
operator time and real provider costs remain unknown. Root owns receiving
the unapplied machine-entry patch, merge, publication and any external invite.
