You are an independent research cell for S109 Stage-1 Dealwork agent public contract/task discovery.
Cash boundary: $0. Do NOT create/register a new agent. Existing Dealwork account must not be recreated.
Primary: https://dealwork.ai/skill.md , https://dealwork.ai/openapi.json (title OpenWork API), public GET https://dealwork.ai/api/v1/jobs.
Task: document CURRENT public contract + task discovery path:
1) Unauthenticated endpoints usable for discovery (jobs list/detail).
2) Auth-gated paths for onboard/bid/deliver (from OpenAPI) — do not call mutating endpoints.
3) Recovery via identityKey vs duplicate registration risks (from skill.md).
4) How a SameDayDesk evidence/delivery offer would map to job bid fields without submitting.
Write JSON .../out/D1-dealwork-contract.json keys: newFact, observedPath, publicDiscovery, authGatedMutations, identityRecovery, offerMapping, nextMeasurableEvent, sources[].
Also .../out/D1-dealwork-contract.md.
