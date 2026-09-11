# RECEIPT — W5-D05 Co02 private result mailbox

Repo: `epistemedeus/samedaydesk`
Feature branch: `cursor/w5-d05-co02-private-result-mailbox-with-request-bound-pickup-1284`
StartingRef: `baf09dc591c83aec94e0cf42c5c64076fc5b98e3`
Owned paths: `tools/result-mailbox/`, `experiments/wave5/d05/RECEIPT.md`
Integration owner: W5-D01

Pre-test revision. Test counts and PR URL are filled after the CLI/process run.

## Source heads consumed (read-only)

| Ref | SHA | Use |
| --- | --- | --- |
| Co02 mailbox startingRef | `baf09dc591c83aec94e0cf42c5c64076fc5b98e3` | owned mailbox kernel |
| SDS PR52 / D01 current pin | `aeef964fa188443078958d9d6d393afae1d542ee` | receipt.v1 contract; spawned CLI from a git worktree. Not imported. |
| PR51 useful-jobs | published archive on this checkout | engine spawn |
| I01 hasher | `819fa637ecf5e5177c84efc16fcaa18d57017631` | already vendored under `vendor/i01-funded-task-terms/` |

Pilot Wave5 pin: `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`.
REVIEW-INTEGRATION Co02: pickup is not delivery; copy/verify race; traversal request IDs; unknown-job fallback.

## Remaining integration binding

D01 has not published a Wave5 wrapper export yet. This mailbox was developed against PR52 `aeef964fa188443078958d9d6d393afae1d542ee`. D01 may amend `server/paid-useful-jobs/`; consumers must re-bind to that later head. D06 owns callback outbox. No hosted HTTP mailbox or Postgres.
