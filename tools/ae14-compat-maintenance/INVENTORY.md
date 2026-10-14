# Inventory

Closure before this package. Matching older filenames were not treated as this
outcome.

| Item | Pin |
| --- | --- |
| SDS base | `d8cea059213e06d2f263be67f82e498f8052a50f` |
| Branch | `codex/ae14-e11-compat-maintenance` |
| Writer path | `tools/ae14-compat-maintenance/` |
| Portfolio | pilot `7428845d6429b78573801ee8035953e26c610eaf` |
| H matrix | pilot `ecf78d29c2c592dd03b5daef4eeba2f29772c8ae`, section "Composed receiving matrix for the actual amended exports". Not run |
| Stage script | pilot `c3436e8647bd111a04359193c55f2c97be77e180`, blob `613e3e336fc315650ea195270c010b1ef75ecf2a` |
| E01 receipt | neomorphic-io `codex/ae14-e01-repeat-procurement` `7f458d5156fb308a5586bdba30a2ff7ae01357ab` (parent `fc8a82ba16d68cba0aa805c0a3d0fd76fd5b6751`) |
| E02 receipt | neomorphic-io `codex/ae14-e02-compat-repair` `338b9dfebf415d00ee0a21773d4d7f848d9ba4d6` (implementation `085791bde7e01e0c57f25dec4562e21c3f565b07`) |
| E06 receipt | neomorphic-io `codex/ae14-e06-task-economics` `75312c3ac1590dbf913ae516b7fb76c9db6e74d9` |
| Recipes consumed | `tools/recurring-job-recipes/` at the SDS base, recipe `source-change-alert` |
| Reuse consumed | `tools/result-reuse/` at the SDS base |
| Finite queue 228300 | x402-url-extractor `b0fe7246211318e0df183a733a62c047bae4b4fb` `experiments/phase-20261011/211150-finite-queue/`. Input only. Executed no-delta. Not copied |
| Supplier 228200 | neomorphic-io `4133cde2ad11e7c58e5913c95c4134b253ab7bdc` `experiments/phase-20261011/211150-supplier-case/`. No-delta handback. Not rerun |

No adequate copy of this acceptance template existed at the base. The whole
outcome was not already present, so this package is the missing delta.

The template fills one finite occurrence: detect a compatibility change, record
repair or useful no-fit, then accept or reject. Repeat-procurement and
cold-takeover rules come from the E01 receipt. Repair and useful no-fit come
from the E02 receipt. Per-capture fee atoms, unknown effort, and unrepriced
221400 and 234100 nets come from the E06 receipt. Fee division follows
`floor(capture * 500 / 10000)` per capture from commerce-payments `docs/Fees.md`
at `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9` (MIT, Copyright (c) 2025 Coinbase).
No contract code was copied.

Next integration owner: dr eggbot, then Root. H join stays pending.
