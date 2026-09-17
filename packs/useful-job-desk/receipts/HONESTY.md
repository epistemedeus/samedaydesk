# Honest receipt rules

`delivered` is true only when the published useful-jobs 1.4.7 CLI exits 0 and every catalog-promised output exists as a regular file inside `--out-dir`. A directory named like an output, a missing file, or a path that leaves `--out-dir` cannot be reported delivered. A `run` receipt that claims delivered names `jobId`, `outDir`, and the promised files so the claim is checkable. Refusals are parseable JSON (`ok: false`, `code`, `error`).

`repeatDemand`, `organicDemand`, and `purchaseAuthority` stay false. A changed-input second run is a caller repeat, not observed demand.

Changed-input distinctness uses a stable output fingerprint (JSON with `generatedAt`, `outDir`, `caller`, and `digest` stripped). The engine `digest` for lockfile-pin-delta hashes the JSON including `generatedAt`, so two runs of the same files can differ without a material change.

Same fixture twice labelled repeat demand is refused (`same-fixture-labelled-repeat-demand`, exit 2, `delivered: false`), including hidden aliases (`--repeat-demand`, `--repeatDemand`, `--demand-class repeat-demand`).

`--example` is refused. This pack runs owned files under `callers/` only.

Engines stay unmodified: the pack binds the committed 1.4.7 archive by size, sha256, and the `engines/` tree hash in `PIN.json`. It does not vendor `engines/`.
