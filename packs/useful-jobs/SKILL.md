---
name: useful-jobs
description: List and help for the offline useful-jobs archive. Use after unpack to inspect the ten jobs on Node 22 without executing them. Triggers on useful-jobs list, useful-jobs help, catalog inspection, cold agent first look. Use when the user runs /useful-jobs.
---

# useful-jobs

Cold-agent skill for the SameDayDesk useful-jobs archive. Shipped as archive-root `SKILL.md` in the next package.

Node >= 22. Offline after extract. No purchase, network, or scheduler authority.

`$kit` is the unpacked archive root. It contains `bin/useful-jobs.mjs` and this file.

## Advertised entry

```bash
node "$kit/bin/useful-jobs.mjs" list
node "$kit/bin/useful-jobs.mjs" help
node "$kit/bin/useful-jobs.mjs" help lockfile-pin-delta
node "$kit/bin/useful-jobs.mjs" help api-upgrade-brief
```

`list` prints ten job ids, starting with `lockfile-pin-delta`. `help` prints the router. Job help prints that job's caller contract.

Machine-readable list:

```bash
node "$kit/bin/useful-jobs.mjs" list --json
```

Unknown job ids refuse closed. `help not-a-job` exits 2 with `unknown job`.

## Rules

- Stay on list and help from this skill.
- Caller files and labeled samples are later work, not this entry.
