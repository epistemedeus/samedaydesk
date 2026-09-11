# W5-D14 RECEIPT — thin real HTTP consumer

**Task:** W5-D14
**Repo:** `epistemedeus/samedaydesk`
**Branch:** `cursor/w5-d14-thin-real-http-consumer-example-not-a-second-server-a0d3`
**Assignment branch name:** `codex/w5-d14-20260911`
**StartingRef / SDS52:** `aeef964fa188443078958d9d6d393afae1d542ee` (PR52)
**Tested D01 HTTP:** `6bed72dd22a396134aa5c957933b42c3a5746698` (`codex/w5-d01-20260911`, draft PR74)
**Tested D01 kernel SHA:** `bccf34b3816ebe20d43823d0978308fd10f9bb33`
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`
**Pilot source:** `epistemedeus/pilot@95b3f3a47f5b1b69bd237e4c978fc3376221365d`
**Owned paths:** `experiments/wave5/d14/`

## What

Fetch-only consumer of D01 loopback HTTP. `submit` reads caller JSON files and
POSTs those bytes to `POST /execute`. A second process `fetch`es
`GET /results/:id`. No wrapper, engine, or ResourceServer is copied here.

## Current-source findings

SDS52 `aeef964` `server/paid-useful-jobs/lib/envelope.mjs` still declares
`https://samedaydesk.com/paid-useful-jobs/<id>` with `live: false`. SDS Express
`POST /execute` is not that contract (tested against `createSdsApp`).

D01 at `6bed72d` publishes `GET /health`, `POST /execute`, `GET /results/:id`.
Its in-tree HTTP test posts filesystem paths. This consumer sends JSON text
instead, so an independent process does not share disk paths with the server.

D01 GET still returns output `path` values on the server host. This consumer
treats the contract JSON (executionId, input sha256, outputsDigest) as the
fetched result. It does not claim HTTP payload bytes for `.md` / `.json`
artifacts.

Non-JSON job inputs remain a D01 binding: a non-JSON string is still a path
in `materializeInputs`.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/d14/test/*.test.mjs
```

Counts are filled after the first executed run on this branch.

Postgres is not required for this claim.

## Integration limits

- Tested D01 `execution.v1` at `6bed72dd22a396134aa5c957933b42c3a5746698`. Not a later sibling.
- Remaining D01 binding: live/public HTTP, non-JSON byte envelope, output payload on GET.
- No production deploy, live settlement, catalog publication, or new spend.

## pstack

Plugin cache `68d834d9ca8f34c375ecb8057bfbcde5396a01f8` contains poteto-mode and
setup-pstack. `~/.cursor/rules/pstack-models.mdc` is absent. Skills were read
from that cache. Literal slash commands were not invoked. No extra Cloud
agents. Parent run model: Cursor Grok 4.6 xhigh (`cursor-grok-4.6-xhigh`).
