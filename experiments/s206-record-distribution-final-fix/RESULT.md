# S206 RESULT — three residuals on S198 candidate

Parent session: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`  
Model: `grok-4.6` · effort `xhigh`  
Branch: `codex/s206-record-distribution-final-fix-20260910`  
S198 terminal (not rewritten): `6a7b5b6885842b78c40ecbef1c63570d7987fbe7`  
Product commit: see branch tip after RESULT commit (no stamp-loop).

Cash $0. No merge/deploy. Pulse/homepage/auth/payment untouched.

## Repro then fix

| ID | Observed on S198 CLI/adapter | Fix |
| --- | --- | --- |
| F1 | `resolveMaybe` searched CWD then `PKG_ROOT/examples`; missing `positive.json` in CWD silently used bundled evidence | Explicit CLI paths → CWD only; manifest-sourced → manifest dir only; `sample` still uses `examples/` |
| F2 | `--write-next-run` `writeFileSync` overwrote diagnosed input | record-repeat `writeNext`: protect input/`--record`/imported manifest (realpath+inode); exclusive `wx` |
| F3 | `JSON.parse` of `null` is `typeof object`; `obj.rows` threw | After parse, refuse `null` / non-object-non-array as `unsupported-pricing-shape` |

## DIST08 fixtureDerived

`vendor/dist08/src/diagnose.mjs` `summarizeAcquisition` copies id/kind/sourceTag/provider/jobRef/… and **drops** `fixtureDerived`. Joined `linkActivated` rows could look live.

Disproof of “unqualified activation” after product fix: `compose.mjs` `retainFixtureDerived` copies `fixtureDerived: true` onto `diagnosis.joined[].acquisition` when the synthesized event had it. Product `gaps` still include `fixture_derived_acquisition`. DIST08 join algorithm not rewritten.

## Suites

| Command | Result |
| --- | --- |
| `npm --prefix experiments/s134-record-jobs test` | 42/42 |
| `npm --prefix experiments/s163-record-recipes test` | 7/7 |
| `npm --prefix experiments/s176-record-repeat-package test` | 26 pass, 1 skip then dist present after rebuild |
| `npm --prefix experiments/s185-distribution-repair-package test` | 20/20 |
| s198 `caller-both-kits` | 2/2 |
| hosted-startup | 4/4 |
| spa-route-shells | pass |
| client build | both inner shells |
| browser desktop | pass after kit-name update |
| Pulse | not modified; two VM env failures remain (`.ts` import / missing PG17 `initdb`) |

Fresh tar extract (outside repo): two caller cases each kit; F1 colliding `positive.json`; F2 overwrite-input; F3 `null` pricing — all structured, no bundled fallback.

## Archives (rebuilt so download matches amended source)

| Kit | File | sha256 | bytes |
| --- | --- | --- | --- |
| record-repeat | `/kit/record-repeat-job-6a7b5b688584.tar.gz` | `27f7bc0175e23820019a360c7561e43dfa50cff90a453eb2cafe01b5b595bcb0` | 1253961 |
| distribution-repair | `/kit/distribution-repair-6a7b5b688584.tar.gz` | `479e4ce53986291090e455cd26b364de04e2fe49b6c44fe484e0a57b73f74c56` | 76888 |

Discovery JSON, `distributionRepairKit.json`, and `RECORD_REPEAT_*` machineEntry literals match those receipts.

## Remaining limit

DIST08 vendor `summarizeAcquisition` still omits `fixtureDerived` internally; the product diagnosis surface re-attaches it. Pulse env gaps unchanged.
