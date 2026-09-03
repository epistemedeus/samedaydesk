# Bazaar rematerialization changelog

One-shot, cron-free field changes for the repaired-seller cohort. Full CDP
discovery snapshots stay in ignored `snapshots/`; Git tracks a per-route
digest (resource URL plus a hash of description, accepts, and extensions)
and this log.

Volatile catalog fields (`lastUpdated`, `quality`) are stored on local
snapshots when present and excluded from the changelog. Field-level history
lives only in `changelog.jsonl`.

## 2026-09-03T09:54:04.798Z (live)

Baseline digest observation from the live rematerialization (129 routes,
11 sellers, source `cdp-discovery`). No prior observation to diff.
ArgonautWorks remains at 0 indexed routes. LoyalSpark and 402.com.tr were
still `partialResults` at capture.

