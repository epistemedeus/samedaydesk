# S85 RESULT — Agentverse A2A negotiation repair

## Failure reproduction
Live `/.well-known/agent-card.json` advertised top-level `protocolVersion: "0.3"` while `a2a-sdk==1.1.2` JSON-RPC handlers validate `A2A-Version: 1.0` (missing header ⇒ 0.3). Cold clients following the card used 0.3 shapes (`role: user`, `message/send`) and failed against the live lf.a2a.v1 SendMessage path. Fieldwork: SendMessage only with `A2A-Version: 1.0`. Discovery nonpaying.

## Cause
`agent_card_to_dict` merges v0.3 compat when `AgentInterface.protocol_version` is empty → injects top-level `0.3`. First-party `a2a-storefront.mjs` already uses `A2A_VERSION = "1.0"`.

## Fix
Set `AgentInterface.protocol_version=PROTOCOL_VERSION_1_0` in `integrations/agentverse-a2a/main.py`; keep upstream discovery `A2A-Version: 1.0`. Added Starlette + official client negotiation tests.

## Native owner
- `/home/ubuntu/.grok/bin/grok` 1.0.25; `grok-4.6` + `xhigh`
- session: `usage-session.json`
- Cursor: git/process only

## Tests
24 passed (`pytest-final.txt`) on `a2a-sdk[http-server]==1.1.2`.

## Delivery
Merchant push 403. Bundle BASE=`4910f83bd2be1e38667f1a3cfa23c70fcff6b0c1` TIP=`c6c772a181d5dc87e8e8a305af75eb169b506a11` on this SDS handoff branch.

## Remaining live gate
Root hosting deploy. After deploy: interface `protocolVersion=1.0`, no top-level `0.3`.
