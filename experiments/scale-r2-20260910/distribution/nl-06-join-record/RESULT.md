# NL-DISTRIBUTION-06 RESULT

| Field | Value |
| --- | --- |
| Task | NL-DISTRIBUTION-06 |
| Branch | `codex/nl-distribution-06-join-record-20260910` |
| Base | `ea000772cdbd6d5df7174369dcef9aa2270e5723` |
| Tip | _(filled after commit)_ |
| Scope | `experiments/scale-r2-20260910/distribution/nl-06-join-record/` |
| Tests | `npm run test:nl-distribution-06` |
| Paid invoke | **false** |
| CloudAgent | **false** |
| S172 sequencing | tip `ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe` already saved — **no overlap** |
| Record04 pin | `8b8e44376e9414f540483a526b048beb9e4dc370` |
| Feed artifact | `fixtures/dist-repair-feed.positive.json` (imported from Record04 export) |

## Deliverables

- `src/join.mjs` — `buildBundleFromFeed`, `joinRecordToDiagnosis` (source-compatible only; gaps explicit)
- `src/cli.mjs` — `demo | join | bundle | validate`
- `src/validate.mjs` — forbidden revenue/intent/traffic rejection; unavailable ≠ no_users
- Fixtures: positive / partial / rejected / invented-revenue / unavailable
- `imports/RECORD04-CONSUMER.md` + `HANDOFF.md` (cite-only)
- Demo artifact: `artifacts/join-result.positive.json`

## Acceptance

| Criterion | Met |
| --- | --- |
| Join only source-compatible events | yes (`jobRef` + `sharedEvidenceId` + grexal provider) |
| Gaps explicit | yes (`gaps[]` always present) |
| No revenue invention | yes (forbidden fields rejected; claims.inventedRevenue=false) |

## Blockers

none
