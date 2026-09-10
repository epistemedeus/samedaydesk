---
name: distribution-repair
description: Diagnose why a listed tool cannot run from caller listing snapshots and a baseline/current route pair. Unpack the lean archive, run the shared CLI, keep incomplete or mismatched cases explicit, and emit owner repair guidance.
---

# distribution-repair

Cold-agent skill for the SameDayDesk distribution-repair package.

Source pins: `0e703bd4682894df4e1d25c61b594cac49f2463c`, `a7e2cd7a2223e2aa7e7e09eebf3695aba4731205`, `ea000772cdbd6d5df7174369dcef9aa2270e5723`, `76c0732b241beaa569f05a7394fdbf49604ffb66`.

## Cold start

```bash
mkdir -p /tmp
tar -xzf distribution-repair-*.tar.gz -C /tmp
cd /tmp/distribution-repair
node bin/distribution-repair.mjs sample --positive
```

## Input

Caller JSON:

- `identity.provider` plus `jobRef` or `sharedEvidenceId` (required for a join)
- `discovery` listing snapshot (`catalogComplete` false cannot prove global unlisting)
- `record.routeRegressionInput` `{ baseline, current }`

Filename is not identity. Unrelated sources must not join.

## Rules

- Incomplete current capture cannot prove global removal.
- Missing identity stays unknown; missing record stays missing_record.
- Offline diagnosis does not invoke priced execution.
- Repair is owner guidance, not lost-customer or revenue proof.
