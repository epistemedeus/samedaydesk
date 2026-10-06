# Feature map — W3-13 H02 vendor price/API feed

SDS vendor observation ledger. Not F08 `server/paid-useful-jobs/`. Not H3 Neo
`packs/licensed-artifacts/`. Not F14 Pilot brief. PR51 `vendor-budget-impact`
price facts are fixtures / subject.

| Field | Value |
| --- | --- |
| User goal | Ingest a vendor price observation with original source, prior observation, units, and effective date; list current; keep older digests stale; refuse SAMPLE as upstream. |
| Entrypoint | `tools/vendor-price-feed/` (`bin/vendor-price-feed.mjs`, `lib/ingest.mjs`) |
| Command | `cd tools/vendor-price-feed && node bin/vendor-price-feed.mjs journey --fixture fixtures/ok.json` |
| Engine | PR51 useful-jobs `vendor-budget-impact` price facts (`samples/pricing/a/before.json` `gpt-4.1-input` = `2.0` `USD/1M-tokens`) as fixtures. Archive 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`. |
| State | `status: current \| stale` (explicit); `provenance: fixture \| test \| upstream`; SAMPLE cannot be `upstream`; `purchaseAuthority: false`; `liveCatalogWritten: false` |
| Tests | `tools/vendor-price-feed/test/*.test.mjs` via `npm test` in this directory |
| Account prerequisite | None. Offline. No wallet, facilitator, chain, queue, or new account. |

Live extract `$0.005` and seller-integrity-audit `$0.01` stay unchanged.
