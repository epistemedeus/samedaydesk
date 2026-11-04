# AGL decision transfer

Synthetic requester A produces one bound harbor catalog decision. Contributor B carries that decision and its before-work manifest on the existing voluntary rail. Requester A grants it to requester C. C exports it and runs `result.transfer.command` in a separate process. The source-change-alert recipe and its CLI are bind-mounted to `/dev/null` in that process, and an exec trace records that they are not executed.

The prepared command carries horizon `168` because the bound identity now stores `horizonHours`. The only declared placeholder, `<the same before-work manifest>`, is filled from the exported manifest. `bound-observation.json` stays the relative artifact name.

The disposable host is loopback, `acceptedWorkPublic` false, and unfunded `voluntary-artifact-v1`. The live public profile is read and left as it is. This run is not independent use and is not a non-Pilot grantee.

## Check

```sh
node --test --test-concurrency=1 experiments/agl-decision-transfer-20261104/test/decision-transfer.test.mjs
```
