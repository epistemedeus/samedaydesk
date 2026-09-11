# Feature map — W5-D24 clean-environment consumer

Thin consumer. Does not reimplement D01, D07, or Co14/D08.

| Field | Value |
| --- | --- |
| User goal | Install the current D01 CLI, D07 export/import, and Co14 Python client into a directory that is not the SameDayDesk monorepo, invoke them, and retrieve a useful vendor-budget-impact report. |
| Entrypoint | `experiments/wave5/d24/` (`bin/clean-env.mjs`) |
| Command | `node experiments/wave5/d24/bin/clean-env.mjs accept --prefix /tmp/d24-prefix` |
| State | `sold` always false; live settlement out of scope |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d24/test/*.test.mjs` |
| Account prerequisite | None. Offline. Node >= 22, Python 3.10+, `tar`. No wallet, facilitator, chain, or new account. |
| Python install | Copy Co14 tree + wrapper. Current Co14 wheel omits `pins.json`. |

## Acceptance classes

| Class | Meaning here |
| --- | --- |
| fixture | Co14 `--example` SAMPLE (not a customer) |
| local-runtime | pip-installed Co14 + staged D01/D07 mini-layouts + committed useful-jobs archive |
| external-acceptance | live origin GET / production install. Not claimed. |

## Later integration bindings

- D01 still resolves catalog/kit/archive from `REPO_ROOT` relatives. This consumer stages those three pin files next to a copied `server/paid-useful-jobs/`. It does not claim D01 is an npm package.
- D08 Wave5 branch was unpublished; tests use Co14 `4641173163616b76608cbb3beb503f2d94369b25`. Empty engine `list` still returns packaged job ids.
- D07 completeness vs D03 `receipt.json` stays unbound unless D03 is injected.
