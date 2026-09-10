# S214 provenance — product-only release composition

Base main: `2b80f38a4e5ec5f080d1764de7c539af63190012`

| Source | Role |
| --- | --- |
| S206 tip `0f9771cff46c939f0e191bf80b7716feff4e62eb` | terminal collection tip |
| S206 product `dcc78f31097b3d3a6e23778c5fe77b5af4cc88b1` | F1–F3 source + rebuilt archives |
| S198 composition on main | record-repeat + distribution-repair pages/kits |

Excluded from this release branch: raw native transcripts, internal orchestration prompts/receipt forests under `native-cells/` (S198/S206). Compact historical RESULT.md files retained for pin trail.

Pulse / homepage / payment / prices: unchanged vs main.

S214 optional product delta: `preparePricingTable` refuses non-array `rows`/`items` (`unsupported-pricing-shape`). Record-repeat kit rebuilt to `record-repeat-job-b663e53771a3.tar.gz` so download bytes match. Distribution-repair kit left at S206 `6a7b5b688584` (does not vendor that adapter).
