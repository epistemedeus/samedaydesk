# Receiving

SPDX-License-Identifier: MIT

Root already has the compiled public client, the deployed discover, assess,
and prepare surfaces, and disposable authorized claim/status smoke. Smoke is
not a customer. This package is the later caller: one continuation file, one
task, one operation id (`task:<task id>`), and a second process that reads
status with its own grant.

## Lanes

| Lane | Where it runs | Who pays |
| --- | --- | --- |
| `agent_assisted_human` | `https` origin, normally `https://ein.llc` | The human, after claim |
| `disposable_owner_qa` | Loopback `http` only | Nobody. Fixture auth only |
| `autonomous_machine_purchase` | Refused | Nobody |

A claim-link view does not set revenue, completion, or authorization.
`filingAuthorization` stays false.

## Production

Read-only check: `node scripts/production-readback.mjs`. It runs `discover`,
`GET /api/healthz`, the agent card, and `GET /api/agent/v1/compare-states` on
`https://ein.llc`. The acquisition URL may 404 until root deploys; that 404
is `published: false`, not a failure, and it is not receipt of the candidate.
It does not assess or prepare.

Conditional next step, if a real task is actually being started: assess
persists a formation assessment row, and prepare creates a provisional
application plus a claim link. Do not call either one to prove this package.
A human operator does that for a real task, then issues a status grant.
This client will not invent the company, the recipient, the grant, or the payment.

Changed catalog terms after a case exists stop the client with `terms_changed`.
Redirects, oversized or stalled bodies, expired or foreign grants, and unknown
application statuses stop with a structured `recovery` object. None of those
are a reason to log in again or to open a second case.

MCP HTTP 200 JSON-RPC errors, A2A JSON-RPC errors, and non-immediate A2A task
envelopes after prepare are `prepare_uncertain` unless the server contract
proves the refusal happened before dispatch. Resume replays that bound body.
The client does not poll an A2A task or open another application. Read-only
invalid responses stay deterministic.

## Publish

The v0.1.3 candidate archive and `ein-activation-continuation-v0.1.3.json` live under
`artifacts/ein-llc/public/downloads` with `published: false`. Root merges and
deploys. This branch does not deploy. `preview/DOWNLOAD-PREVIEW.md` is an
unpublished operator note and is not in the archive. A library download is
not a customer activation.

Root owns the live unversioned index. This successor does not edit it or either frozen predecessor.
