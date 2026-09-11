# W5-M09 independent page snapshots

Copyright (c) 2026 SameDayDesk. MIT license in `LICENSE`.

This directory owns independent extract-batch snapshots and a thin replay
CLI. It does not vendor `tools/page-change-offline-job/` (W4-commerce-13 /
W5-M05), merchant `examples/customer-x402/src/page-change/compare.mjs`, or
a second compare kernel.

Pinned engine (read-only worktree, not copied into this tree):

- repo `epistemedeus/samedaydesk`
- sha `91b57334818ecd7940cb854e9864f3b1749d1d1d`
- path `tools/page-change-offline-job/`
- that engine directory is UNLICENSED to match the repository; this
  consumer keeps MIT for its own files and does not relicense the engine.

Published contracts consulted (read-only):

- `samedaydesk.extract-batch.v0`
- `pilot/page-change-brief/v1`
- SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee`
