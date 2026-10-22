# How to discover SDS without paying

Use this when an agent VM cannot load `https://samedaydesk.com/for-agents` or
when you must not spend.

## Offline fixture (default for this doc set)

From the repository root:

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
```
<!-- follow-expect {"exit":0,"json":{"outcome":"offline_fixture","paid":false,"liveObserved":false}} -->

`preferFixture: true` performs no network request. Fixture bodies are
digest-checked. Corruption fails rather than inventing a live success.

## Live free HTTP (optional, not followed here)

The same helper without `preferFixture` reads the apex guide first, then
`https://agents.samedaydesk.com/llms.txt` and
`https://agents.samedaydesk.com/.well-known/skills/index.json` if the apex is
unavailable. That call is free HTTP only. It still does not pay.

```text
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead(), null, 2))'
```

Possible live outcomes: `apex_live`, `alternate_live`, `unavailable`. Alternate
catalogs remain partial discovery, not the apex job instructions.

## What discovery is not

- Not a complete GitHub issue discussion (body plus comments).
- Not a paid `GET /extract` or `POST /extract/batch`.
- Not MCP Registry `version=latest` selection. That pitfall is documented in
  `tools/presence/REGISTRY-CONSUMER.md` and is not a cold-follow step.
- Not authorization to run `vendor/neomorphic*` or to open `neomorphic.io`.

If you already know the job type, route it instead of guessing a paid URL:
[route-a-job.md](route-a-job.md).
