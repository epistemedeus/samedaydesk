# Honest receipt rules

`delivered` is true only when the published useful-jobs 1.4.7 CLI exits 0 and every promised output file exists. Missing output cannot be reported delivered.

`repeatDemand`, `organicDemand`, and `purchaseAuthority` stay false. A changed-input second run is a caller repeat, not observed demand.

Same fixture twice labelled repeat demand is refused (`same-fixture-labelled-repeat-demand`, exit 2, `delivered: false`).

`--example` is refused. This pack runs owned files under `callers/` only.

Engines stay unmodified: the pack binds the committed 1.4.7 archive by size and sha256 and does not vendor `engines/`.
