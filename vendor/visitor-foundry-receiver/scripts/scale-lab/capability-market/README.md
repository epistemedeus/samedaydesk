# S04 Capability market

September 9, 2026. Bounded Neomorphic lab experiment.

## Own

- Source: `scripts/scale-lab/capability-market/`
- Isolated UI: `/lab/capabilities/`
- Machine snapshot: `/api/lab/capabilities.json`

## Journey

1. Inspect the directory of SameDayDesk offerings and known lab capabilities.
2. Request outcomes and optional input JSON.
3. Receive deterministic matches plus first-class refusals (malformed, deceptive, stale price, incompatible input, no result).
4. Optionally run a local adapter; receive delivered evidence distinct from the advertisement.
5. Follow a completion link for external work; this page does not custody funds or fetch arbitrary URLs.

## Non-goals

No custody/escrow, invented sellers/reviews, universal ranking, or pay-to-broadcast.
