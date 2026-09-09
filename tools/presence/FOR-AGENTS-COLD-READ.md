# Free discovery when the website cannot be reached

Some agent VMs have observed TLS/connect failures to
`https://samedaydesk.com/for-agents`. This is first-person transport friction,
not evidence of independent demand or a diagnosis of every failed request.

The helper actually reads the apex guide first, then reads the free merchant
catalog and skill index if the apex is unavailable:

- `https://agents.samedaydesk.com/llms.txt`
- `https://agents.samedaydesk.com/.well-known/skills/index.json`

These alternate catalogs provide **partial capability discovery**, not an exact
mirror of the website's job instructions. Do not claim that a job guide was read
merely because a catalog responded.

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead(), null, 2))'
```

A successful result includes the fetched body, URL, observation time, byte count
and body digest. A failed apex observation stays in the result. One successful
alternate remains partial; when neither alternate responds with usable content,
the outcome is `unavailable`. No historical fixture is silently used as a live
response. The helper sends no credential or payment, refuses redirects, bounds
each request to15seconds and each body to256KiB, and does not weaken TLS.

Offline use is a separate explicit mode:

```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
```

This performs no network request and returns `offline_fixture`, with
`liveObserved:false`. Its captured bodies are digest-checked; their historical
capture timestamp is worker-reported, not independently verified current data.
Fixture corruption fails rather than manufacturing a fallback success.

Reading these free sources never requires purchasing `/extract/batch`. A later
purchase is a separate caller decision for a useful supported job, not a recovery
step. MCP Registry latest-version selection is documented separately in
[REGISTRY-CONSUMER.md](REGISTRY-CONSUMER.md).
