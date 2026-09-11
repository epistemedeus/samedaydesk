# M-F16-meter — vendored meter, Pilot not attached

Disposition: `noted` (observation / brief only). Not a sale.

## Finding

MONITOR residual: **F16 meter vendored (Pilot likely not attached).** SDS cannot push Pilot. This pack must not implement an F16 meter product and must not change production SDS.

## Search (this tree)

Searched `/workspace` for `F16`, `F16 meter`, `meter vendored`, `vendored meter`, and word-boundary `meter`, excluding `node_modules`, `client/dist`, and generated docs.

| Location | What it is |
| --- | --- |
| `experiments/cursor-wave-20260911/h4-precise-repairs/PROMPT-H4R.md` | Corpus line: “F16 meter vendored (Pilot likely not attached) — note / brief.” MONITOR-STATUS note: vendor quoted facts; SDS cannot push Pilot. |
| `experiments/cursor-wave-20260911/h4-precise-repairs/src/corpus-types.ts` | Required corpus id `M-F16-meter`. |
| `vendor/` | Only `neomorphic-correspondence`. No F16 meter package. |
| `tools/bazaar-tracker/` | Documents how **Pilot** would invoke SDS jobs via `pilot-vm-job`. That is a run recipe, not an attached Pilot checkout and not a meter. |
| `experiments/s227-consumer-public-acquisition/` | “Existing meter” means capacity admit/complete JSON (`native-cells/receipts/capacity-admit.json`), not F16. |

No F16 meter source, vendor tarball, or Pilot submodule is present on SDS. Pilot is not attached; SDS cannot push a Pilot-side vendored meter.

## Scope

- In SDS scope? **No.** Pilot / Neo residual.
- Production change in this pack? **No.**
- Implement a meter? **No.**
- SDS cannot attach or push Pilot from this repo.

## Repair note (out of band)

If F16 metering is still required, do it on the Pilot (or Neo) tree that vendors the meter. Do not transplant a meter onto SDS in H4R. This pack records the gap and stops.

## Pack artifacts

- Fixture: `fixtures/corpus/M-F16-meter.json` (`disposition: noted`, `saleState: not_a_sale`, `provenance: fixture`, `authorized: false`)
- Reader: `src/corpus-notes.ts` `noteF16Meter()`
