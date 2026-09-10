# R2-DISTRIBUTION-07 — Counterparty delivery packet

Isolated experiment under `experiments/scale-r2-20260910/distribution/07` (repo: `epistemedeus/samedaydesk`).

## Outcome

Prepare a **concise executable artifact handoff** for a **specific currently unresolved verified request**; **kill if requester already has a fix**.

- Input: verified request `{ requestId, requesterId, problemSummary, unresolved, requesterAlreadyHasFix, artifactHints? }`
- Packet shape (ready): `{ status, artifactRef, runCommands[], acceptanceChecks[], privacyBounds }`
- Kill when `requesterAlreadyHasFix===true` OR `unresolved===false` with fixEvidence — **no executable runCommands**
- Capture outcomes: `ready_handoff` | `killed_requester_has_fix` | `blocked_missing_input` | `unavailable` | `no_users` — **unavailable ≠ no_users**

## Authoritative marketplace state (S149)

| Provider | State | Notes |
| --- | --- | --- |
| Grexal | **PUBLIC_ACTIVE** listed | agentId `j970cajvv6wbrmy64s2f4ajzw18e5j2q`, deployment v1; pricing Version1 `run_completed` **0.02 USD** (estimate reserve 0.025 is NOT a charge); **no customer execution/revenue/payout yet** |
| Agensi | Free **PendingReview** | 0 installs — wait real review/demand; do not invent installs/revenue |

Receipt: `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json`

DEMO cites Grexal S149 source-change evidence as the **deliverable artifact type** (synthetic request fixtures) without claiming customer revenue.

## Fresh consumer

```sh
node experiments/scale-r2-20260910/distribution/07/src/cli.mjs demo
node experiments/scale-r2-20260910/distribution/07/src/cli.mjs build experiments/scale-r2-20260910/distribution/07/fixtures/request.positive.json
node experiments/scale-r2-20260910/distribution/07/src/cli.mjs validate /tmp/r2-dist-07-packet.json
npm run test:r2-distribution-07
```

Demo writes `/tmp/r2-dist-07-packet.json`, prints ready handoff for an unresolved verified request (Grexal package runCommands; S149 0.02 list price ≠ revenue), shows kill path with empty commands, and unavailable ≠ no_users.

## Status codes

| Outcome | Meaning |
| --- | --- |
| `ready_handoff` | Unresolved verified request without requester fix; executable packet ready |
| `killed_requester_has_fix` | Requester already has a fix / request resolved — **kill** (empty runCommands) |
| `blocked_missing_input` | Missing requestId / requesterId / problemSummary (or required booleans) |
| `unavailable` | Verified-request capture **failed** — do **not** claim zero requesters |
| `no_users` | Capture **succeeded**; verified requester count is **zero** |

## Evidence

See `evidence/INDEX.md` (S149 + DISTRIBUTION-01..06 + S124 package pointers). Extends existing evidence; does not duplicate reporting.

## Mutation boundary

Feature-branch source/tests only. Root owns publication, price, visibility, PendingReview outcome, and merge to default. No CloudAgent. No Grexal/Agensi authenticated mutations. No invented buyers/revenue/payout. Kill when requester already has a fix.
