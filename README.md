# SameDayDesk (public entry)

Public helpers for **free discovery** and **offline result reuse**. Node **22.x**. No `npm install` required for the commands below — they are plain ESM under `tools/`.

This root README is the stranger entrypoint. Helpers already lived under `tools/presence/` and `tools/result-reuse/`; start here, then open the linked docs.

## Docs (in-repo)

| Doc | Purpose |
| --- | --- |
| [tools/presence/FOR-AGENTS-COLD-READ.md](tools/presence/FOR-AGENTS-COLD-READ.md) | Free discovery when apex TLS/connect fails |
| [tools/presence/REGISTRY-CONSUMER.md](tools/presence/REGISTRY-CONSUMER.md) | MCP Registry `version=latest` pitfall |
| [tools/result-reuse/README.md](tools/result-reuse/README.md) | Offline source → task-memory observation |

Live free catalogs (no pay): `https://agents.samedaydesk.com/llms.txt` and `https://agents.samedaydesk.com/.well-known/skills/index.json`. Apex `https://samedaydesk.com/for-agents` may TLS/connect-fail; cold-read falls back to those alternates.

## Free / live vs offline fixtures

| Mode | Network | Payment | How |
| --- | --- | --- | --- |
| Offline fixture cold-read | none | none | `preferFixture: true` → `outcome: "offline_fixture"` |
| Live cold-read | free HTTP only | none | default resolve → often `alternate_live` when apex fails |
| Result-reuse preview/export | none (local JSON) | none | fixtures + `--opt-in` to write |

Purchasing extract/batch or other paid routes is a separate caller decision — never required for these helpers.

## Exact commands (clean checkout)

From the repository root (no install):

### 1. Cold-read — offline fixture (no network)

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
```

Expected: `outcome: "offline_fixture"`, `paid: false`, `liveObserved: false`.

### 2. Cold-read — live (free HTTP only; optional)

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead(), null, 2))'
```

Expected when apex transport fails but agents.* respond: `outcome: "alternate_live"`, `paid: false`.

### 3. Result-reuse — preview + export on in-repo fixtures

```bash
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node tools/result-reuse/cli.mjs preview \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW"

node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 --clock "$NOW" \
  --opt-in --out /tmp/reuse-observation.json
```

Record-kind fixture:

```bash
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-record-report.json \
  --task-id vendor-watch --subject record-export --sequence 1 --clock "$NOW" \
  --opt-in --out /tmp/reuse-record-observation.json
```

Expected written observation: `schema: "neomorphic.task-memory.observation.v1"`; export requires `--opt-in` plus caller clock/task/subject/sequence.

## Verify the cited examples

```bash
npm run test:public-entry
```

That script runs the offline cold-read and fixture export commands cited above (no network, no payment). Existing focused suites: `npm run test:presence`, `npm run test:result-reuse`.

## Out of scope here

This README does not change homepage/payment routes or turn the root into another Node package. Product app, checkout, and paid MCP purchase flows remain elsewhere in the tree.
