# Remote environment (H7 d18/d20 repair)

| Item | Value |
| --- | --- |
| Host | Cursor Cloud VM (`cursor` hostname is not provider identity) |
| Isolated CWD | `/tmp/h7-witness/wt` |
| Logs | `/tmp/h7-witness/heavy-logs/` |
| TMPDIR | `/tmp/h7-witness/runtime-tmp` |
| Flock | `/tmp/h7-witness/runtime-tmp/test.lock` |
| Node | v22.22.2 |
| Heap | `NODE_OPTIONS=--max-old-space-size=768` |
| Test concurrency | 1 |
| Native session | `01a09456-c82b-7b41-ad58-e5557da52ed3` (H6D parent identity; H7 delivery session not resumed) |
| Model | grok-4.6 effort xhigh |
| Branch | `codex/h7-d18-d20-repair-20260912` |
| Pin | `8a811bbadba7edc6c926b319b0839cd2f01e5896` |
| d18 amendment | unique backup subtree; remove new dests on rollback; `rollback-incomplete` keeps recoveryDir |
| H6D tree | `/tmp/h6d/wt` @ `b54eaa0ae8cb756cdb82b2b923a9468c3893061c` (read-only this turn) |
| H7 evidence tree | `/tmp/h7/wt` @ `e68187b2461cacdbd397cf4225a1755a17e94113` (read-only) |
| Postgres | not started (55590–55595 untested; `pg` module missing in this checkout) |
| Cash | $0 |
| Live pay / merge / deploy | none |

Owned children started for tests were reaped by the test harness. No leftover HTTP/PG processes from this assignment.
