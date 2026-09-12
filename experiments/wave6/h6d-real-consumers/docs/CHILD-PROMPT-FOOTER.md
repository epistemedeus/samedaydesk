## Workspace
- Repo CWD: `/tmp/h6d/wt`
- Branch: `codex/wave6-h6d-20260912`
- Baseline pin: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`
- Parent session: `01a09456-c82b-7b41-ad58-e5557da52ed3`
- useful-jobs 1.4.0 sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes)

## Hard rules
- Write ONLY under your exclusive directory.
- `NODE_OPTIONS=--max-old-space-size=768` for Node.
- Serialized heavy work: do not start large compiles or extra DBs.
- Fetch official source via GitHub raw/API or git; store bounded fixtures + sha256/bytes. No broad scraping.
- Independent witness must not import kit engine compare modules.
- If the engine disagrees with a proven primary-source fact, keep the engine unmodified and write `regression-artifact.json`.
- Unknown outcome is not failure and is not permission to retry forever: record it and finish.
- No payment, credits, signing, external messages, or site publication.

## Done means
RESULT.json exists, tests ran (`node --test`), fixtures + SOURCE.md + acquisition.json + witness.mjs + adapter.mjs + owned-paths.json + test/consumer.test.mjs are in your exclusive dir.
