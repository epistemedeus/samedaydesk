# S21 RESULT — recurring-job + buyer-setup experiment pack

## Identity

- branch: `codex/s21-recurring-job-buyer-setup-experiment-20260909`
- input (unchanged for S19): S12 `200d6765480f5babd4c9c61e01a0b3d2ac988757`
- merchant pin: `f9dd59aeeb200881bc1313ed846ba002e7081258`
- unavailable once: `codex/scale-context-20260909-v2` (branch not found on accessible remotes)

## Delivered

| Workflow | Role |
| --- | --- |
| `source-change-alert` | Incremental immutable baselines; prior never overwritten |
| `issue-to-work-brief` | Public GitHub issue → direct-use work brief + fingerprint diff |
| `buyer-setup-trace` | Live free AgentCash/x402 inspection; stops at unpaid 402 |

Also: schedule-neutral `specs/*.recipe.json`, free HTTP/Git baseline compare, optional local Neomorphic observation import (`sharedMode=undeployed_not_fabricated`), `/for-agents` Job 5 guide update.

## Owner QA source (not demand)

- Issue: https://github.com/epistemedeus/samedaydesk/issues/1
- API: https://api.github.com/repos/epistemedeus/samedaydesk/issues/1
- Observed: 2026-09-09T16:22:28Z (fixture `fixtures/issues/samedaydesk-1.json`)
- Title body bytes: 5267

## Tests (actual)

```bash
export MERCHANT_INPUT_ROOT=/path/to/x402-url-extractor  # f9dd59ae
npm run test:recurring-job-recipes   # 29 pass, ~1.3s
npm run test:spa-route-shells        # 9 pass
npm run recurring-job-recipes:baseline
```

Baseline compare (matched facts): direct 73ms / 7795 B vs recipe 333ms / 20471 B stdout; recipe adds prior-diff + markdown brief; direct remains first-class for raw JSON.

E2E: failure injection on mounted origin → error, payment replay blocked; buyer-setup live probes never sign; Neomorphic local import only.

## Claims boundary

No deploy, spend, cron install, wallet-ownership inference, demand/network claims from fixtures, or prior-receipt overwrite. Homepage/`MERCHANT_PIN` payment authority preserved.
