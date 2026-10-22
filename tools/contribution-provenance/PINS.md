Owning repo: **epistemedeus/samedaydesk** (not merchant).

# R6-06 pins

Unresolved objects follow the S134 pattern: a named SHA that is not present
as a git object is unknown context, not invented, and a claimed hash that
does not bind is `claimed_hash_unbound_object`.

| Asset | Pin | License / note |
|---|---|---|
| SameDayDesk checkout | `775051602d91f42ca1aa920054cfd7a451982940` | commit in this repository; `git cat-file -t` → `commit` |
| Verantis PR2 head | `072f8d04026bb29a62dbf8a761a2ae62abbdc663` (`072f8d0`) | Vendored **commit** object under `fixtures/object-store`. Historical `m9labs-railscope/verantis-mcp` pull/2 head. Object binding only; PR was not merged. Not owner adoption. |
| S122 application-baseline merchant `c0255ac` | **unresolved in this checkout** | Not present as a git object in samedaydesk or the vendored store; treated as unknown context, not invented. Seeded `claimed_hash_unbound_object` failure. |
| Runtime `git cat-file` | local git, no network | Authority for object type. Fixture JSON does not substitute for `cat-file`. Inherited `GIT_DIR` / `GIT_OBJECT_DIRECTORY` / alternates are stripped. |
| GitHub API | **not used** | Actor labels are declared on fixtures (`owner\|member\|commenter\|app`). Do not ping Verantis or x402 Pulse. |

This tree does not fetch remotes, open issues, or mutate upstream pull requests.
