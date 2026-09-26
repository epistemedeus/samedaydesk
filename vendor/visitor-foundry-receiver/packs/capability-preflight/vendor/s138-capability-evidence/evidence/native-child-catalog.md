## Native child catalog verification

Bundled agent types:
explore.md
general-purpose.md
plan.md

Docs: max nesting depth is one (no grandchildren). Source: docs/user-guide/16-subagents.md
327:Only the top-level session spawns subagents. A subagent cannot spawn its own subagents: the maximum nesting depth is one. If a subagent calls `spawn_subagent`, the call fails with a depth-limit error. This keeps the agent tree flat and prevents runaway spawning.

Operator-reported 64 children/parent: NOT found as a hard limit in local grok docs/config. Recorded as operator topology claim, unverified as catalog ceiling.
