# for-agents-cold-read

Free catalog when apex TLS fails. Fixture mode is explicit and dated. Alternate live catalogs are partial discovery, not the apex guide.

| field | value |
| --- | --- |
| goal | free catalog when apex TLS fails |
| entrypoint | `tools/presence/for-agents-cold-read.mjs` |
| command | `presence cold-read` |
| state | `preferFixture:true` → `outcome:"offline_fixture"`, `paid:false` |
| tests | `npm run test:public-entry`, `test:presence` |
| prerequisite | committed fixtures under `tools/presence/fixtures/for-agents-cold-read/` |

## Sub-features

- `offline_fixture` reads captured llms.txt + skills index.
- `apex_live` only if GET `https://samedaydesk.com/for-agents` is 200 (rare from this VM).
- `presence-refresh` `--dry-run --fixture` never `--apply`.

## How to get to it (user POV)

- `/for-agents` on the site.
- Gateway `https://agents.samedaydesk.com/llms.txt` and `/.well-known/skills/index.json`.

## Driving it with verify-cli

Preconditions: none for fixture mode.

- **Fixture.** `node tools/verify/cli.mjs presence cold-read --json`. Exit 0. `result.outcome` `offline_fixture`. `paid` false.
- **Refresh dry-run.** `node tools/verify/cli.mjs presence refresh --json`. `--apply` is never passed.
- **Live** (`--live`) is optional and may be `cdn_challenge` on apex.

## Gotchas

- Alternate catalogs are partial, not job guides.
- Presence `--apply` can POST listing writes; the verifier never sets it.
- Unknown presence surface is product exit 2 — do not invent surfaces.
