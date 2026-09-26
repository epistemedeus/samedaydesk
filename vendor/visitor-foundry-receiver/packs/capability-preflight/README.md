# S180 capability-consumer kit

Portable, dependency-light Cap01–08 consumer journey for a cold agent.

Continues S164 Heavy pin `8a6716482b2f240078f7b17a3cf5547f1d122302` and finishes interfaces across:

| Tip | Role |
| --- | --- |
| `8a671648…` (S164) | Cap02/03/06 (`s138-capability-evidence`) |
| `de206133…` (first-run-s172) | Cap01→02→03→06 first-use |
| `72feb5bb…` (examples-s170) | Cap04/05/07/08 recipes |
| `d3e6febd…` (journey-s162) | Eight-stage journey |

Does **not** rewrite S176/S177/S178 modules. Zero npm dependencies. Node ≥ 22.

## Honesty

- `content_bound` ≠ executed ≠ accepted
- Local probes only with `--probe` / `probe:true`
- Currency/price estimates ≠ actual spend
- Missing evidence is **unknown** (never default true/false)
- `readyForRelease` stays false; no payment/publish/deploy in this assignment

## Quick start (in-repo)

```sh
cd experiments/s180-capability-consumer-kit
node bin/capability-consumer-kit.mjs status
node bin/capability-consumer-kit.mjs cold-start --probe
node bin/capability-consumer-kit.mjs journey
npm test
node bin/capability-consumer-kit.mjs pack
```

## Portable archive

`pack` writes `portable-out/s180-capability-consumer-kit.tgz` plus `SOURCE-MAP.json` (upstream tip mapping for later Neomorphic use).

```sh
tar -xzf portable-out/s180-capability-consumer-kit.tgz
cd s180-capability-consumer-kit
node bin/capability-consumer-kit.mjs cold-start --probe
node --test --test-concurrency=1 tests/*.test.mjs
```

The shipped consumer suite does not include `tests/pack-repository.test.mjs`. Packing from an unpacked tree uses `vendor/*` roots.

## Import

```js
import {
  runColdStart,
  runCapabilityConsumerJourney,
  resolvePrerequisites,
  bindEvidence,
  composePartial,
  buildCostDryRunComparison,
  buildFailureFallbackPlan,
  buildBuyerContextPack,
} from "./src/index.mjs";
```

## CLI verbs

| Verb | Behavior |
| --- | --- |
| `status` | Pins, import paths, honesty notes |
| `cold-start [--probe] [--out-dir]` | Demo Cap01→02→03→06 artifact + next-run input + next-step manifest. `--input` is rejected. |
| `journey [--input] [--probe] [--out]` | Full Cap01–08 journey. Repeat command uses the supplied input path. |
| `pack [--out]` | Portable tarball + source map |
