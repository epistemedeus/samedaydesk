---
name: distribution-repair
description: Diagnose why a listed tool cannot be acquired or run from caller-supplied discovery/listing snapshots and a baseline+current route pair. Unpack the lean archive, run the shared CLI, keep incomplete/mismatch/malformed cases explicit, and emit owner repair guidance without claiming lost customers or production acquisition.
---

# distribution-repair

Cold-agent skill for the SameDayDesk **distribution-repair** package (S185).

Pins: Record04 `0e703bd4682894df4e1d25c61b594cac49f2463c`, Record05 `a7e2cd7a2223e2aa7e7e09eebf3695aba4731205`, DIST08 `ea000772cdbd6d5df7174369dcef9aa2270e5723`, NL06 `76c0732b241beaa569f05a7394fdbf49604ffb66`.

Do **not** rewrite S176 parsers. Do **not** treat Grexal as a universal adapter. Do **not** invoke paid marketplace runs.

## Cold start

```bash
mkdir -p /tmp
tar -xzf distribution-repair-*.tar.gz -C /tmp
cd /tmp/distribution-repair
node bin/distribution-repair.mjs sample --positive
```

## Input

Caller JSON (`pilot.s185.distribution_repair_input.v1`):

- `identity.provider` + `jobRef` or `sharedEvidenceId` (required for a join)
- `discovery` listing snapshot (`catalogComplete` false cannot prove global unlisting)
- `record.routeRegressionInput` `{ baseline, current }` or an already-built Record04 feed

Filename is not identity. Unrelated sources must not join.

## Rules

- Reuse Record04 / DIST08 / NL06 — no second parser.
- Incomplete current capture → `cannot_prove_global_removal`, not global deletion.
- Missing identity → `unknown`; missing record → `missing_record`.
- Free offline diagnosis ≠ priced execution.
- Repair is owner guidance, not lost-customer or revenue proof.
- No production acquisition claim before Root release.
