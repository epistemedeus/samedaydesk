# S198 provenance (composition / relocation only)

Base: `origin/main` @ `2b80f38a4e5ec5f080d1764de7c539af63190012` (Pulse intact).

| Package | Frozen source tip | Role on S198 |
| --- | --- | --- |
| record-repeat | S189 `f830b55bc6f9b31f664394341f33c5e43a2a2cf8` (repair `12d528cdd92ae062d60ecd1beff2c9b5639417d7`; S176 cand `f3d55e54a7b3c548943312443f9f066652d83980`) | production kit + page + discovery + archive |
| distribution-repair | S185 `c05522364b26db04b4aa63f945ad15810785efb4` | production kit + page + discovery + archive |

Parser/recipe pins (record-repeat): parser `65ce1867f1b4339cc708bfb72a7d9a5942785632`, recipes `a022eb6352156dcdcdf2f8730931f5891bd01436`.

Excluded from deployable product (remain on frozen tips only):
- `experiments/s189-record-repeat-review-fix/**`
- package `native-cells` prompts/raw logs
- unrelated experimental branches

No homepage / Pulse / checkout / prices / merchant service edits intended.

## S198 integration repairs (this candidate)

Mechanical merge defects only — no parser rewrite, no kit source reorg:

- `client/src/data/machineEntry.mjs`: restore `.join("\\n")` on distribution-repair command blocks (merge split the escape).
- `server/scripts/test-spa-route-shells.js`: `DECLARED_REACT_ROUTES` includes `/for-agents/distribution-repair`.
- Browser smoke: both inner pages asserted; overflow layout flags on record-repeat.
- Archives were **not** rebuilt: public kit bytes already match S189/S185 packed receipts.
