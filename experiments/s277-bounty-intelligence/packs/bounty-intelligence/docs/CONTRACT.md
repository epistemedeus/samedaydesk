# Pack contract (children + tests)

Deterministic clock: pass `now` into every ranking/freshness function.
Default test now: `2026-09-11T15:00:00.000Z`.
Fixture/test data **must** carry `dataLabel`: `fixture` | `synthetic-edge` | `live-capture` | `derived`.
Never use IEEE floats for money. Atomic decimal **strings** only.

## Record (`s277.bounty-intelligence.record.v1`)

Built only via `buildRecord` in `src/record.mjs`. Adapters fill observation
fields; they do not set `availablePaidJob` (rank module does).

Unknowns are explicit: `unknown: true` and/or listed in `unknowns[]`.
`false` means observed-false; `null` + unknown means not said by the source.

## Adapters (`src/adapters/*.mjs`)

Each exports `{ name, vendorAdapter, liveUrl, fetchList(opts) }`.

`fetchList({ mode, fixturePath, now, limit, httpGet })` →

```
{
  adapter, records, listingMeta, fetchMeta, error
}
```

`mode`: `fixture` | `live`. Live is bounded (`limit` default 5). No crawl.

## Ranking (`src/rank.mjs`)

Hard exclusions (policy cannot override):

- closed / cancelled / claimed-with-no-slots
- deadline expired
- stale observation (`now - observedAt > staleAfterSeconds`)
- unfunded (`funding.status === "unfunded"`)
- funding unknown
- lab schedule (`source.labSchedule`)
- inaccessible source
- reward amount missing or `"0"`
- forum marketing / referral unless `policy.includeForumRewards` (still never if unfunded)

Sort key: expected useful net return desc, then uncertainty asc.
Do not read `shareCount`, board `operators_enlisted`, or GitHub reactions.

## Select (`src/select.mjs`)

One row with `claimability.state === "claimable_with_prereqs"` AND
`availablePaidJob`. Else `{ match: false, reason: "no_genuinely_claimable_paid_job" }`.

## Interop v0 (`src/interop.mjs`)

Project only what the record knows. Do not invent reservations, verdicts, or
payouts. `payout` stays `unknown` or `none` unless a labelled experience overlay
supplies evidence.
