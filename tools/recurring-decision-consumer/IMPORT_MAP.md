# AGL import map (B6 consume, do not duplicate)

Source: Pilot Agent Growth Loops Nov4. Status: **candidates** until AGL second batch re-test. Amend heads when AGL reports new SHAs.

| Surface | PR | Head | Entry |
| --- | --- | --- | --- |
| R05 shared capture / decideOrReuse | [#364](https://github.com/epistemedeus/samedaydesk/pull/364) | `3a4a7538329292c11d94b148d58964fc0656dece` | `tools/result-reuse/src/export.mjs` |
| R06 portable decision | [#366](https://github.com/epistemedeus/samedaydesk/pull/366) | `95c8a84155d01d67c707170e94aa148ba6542c50` (stacked on 364) | `tools/result-reuse/src/portable.mjs` (`samedaydesk.portable-decision.v1`) |
| Residual (optional) | [#365](https://github.com/epistemedeus/samedaydesk/pull/365) | `9d1f3f96` | `tools/result-reuse/src/residual.mjs` |

Recommended integration checkout: `95c8a841` (carries 364).

This package **dynamic-imports** those modules via `src/agl-bridge.mjs`. It does **not** copy them under `tools/recurring-decision-consumer/`.
