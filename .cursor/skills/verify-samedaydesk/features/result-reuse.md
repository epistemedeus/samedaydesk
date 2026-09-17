# result-reuse

Turn already-held JSON into a task-memory observation. Preview is free. Write requires `--opt-in`.

| field | value |
| --- | --- |
| goal | already-held JSON → observation |
| entrypoint | `tools/result-reuse/cli.mjs` |
| command | `pack run result-reuse` then `export --opt-in --out` |
| state | preview does not write; export without `--opt-in` exits 1 |
| tests | `npm run test:result-reuse` |
| prerequisite | a reviewed input JSON; caller supplies task/subject/clock |

## Sub-features

- `preview` shows fields that would copy.
- `export-opt-in` writes only with `--opt-in --out`.
- `export-without-opt-in` exit 1 `refusing to write without --opt-in`.

## How to get to it (user POV)

- `/for-agents` Job 4 copy. Commands in `REUSE_QUICKSTART`.

## Driving it with verify-cli

Preconditions: none.

- **Preview.** `node tools/verify/cli.mjs pack run result-reuse --json` (includes `--task-id`/`--subject`/`--sequence`/`--clock`; preview does not write).
- **Seeded write refuse.** `pack run result-reuse --seeded-failure --json` exports without `--opt-in` and must exit 1 (`refusing to write without --opt-in`). Dest must not be written.
- **Missing `--out`.** `pack run result-reuse -- -- export --input tools/result-reuse/fixtures/accepted-page-change.json --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock 2026-09-09T10:00:00Z` is product exit 1 `export requires --out`.

## Gotchas

- Schema-valid export is user-selected unverified evidence, not public-safe certification.
- Private source text and receipt secrets cannot be selected.
