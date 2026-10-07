# Inherited contract matrix

Sources are the pinned public bytes, not the unserved staged seal
`d2b093c56dc4c09f1d334e7c080a6e89608f3ad8ed83f4d1c0536e747ca8a72e`.

| Contract | Exact pin | Scheduler | Subscription | What this adapter keeps |
| --- | --- | --- | --- | --- |
| change-monitor 0.1.0 | sha256 `a5248cac86ae604b365d95e3c21da5c15cd09f1a962428eb7d60b4c3b210100f`, 88319 bytes | none; one shot | `paidServiceLaunch: false` | material-fields comparison, pause/cancel/expiry terminal rules, unchanged is not a delivery, unknown delivery is not posted again |
| retained-task 0.1.0 | composed on that monitor; `sourceQualified: false` | none | none | task id is the caller name; resume reads the retained baseline |
| maintained-operations 0.1.0 | sha256 `b68024a3b359b354b6869cfdc4621f1eb2947cb40311bf7bafcbd546b0cdabc9` | one observation per invocation | no price | opt-in, one operation identity, no second ledger |
| maintained-useful-delivery 0.3.1 | sha256 `0963ce3be29185a82c0cc11aec0a8eaa3fde7d7a94a9fc6a4e9de4c3513578e5`, `paidServiceLaunch: false`, `subscriptionOffered: false` | none | none proposed | lost reply finishes from the pending body; unchanged/`no_change` is a useful negative; foreign owner conflicts |
| retained-monitoring 100149 / Neo235 | no hosted subscription in the received library | none | none | not relabelled as this service |
| SDS foundry / correspondence | schema `pilot_correspondence`, grants by token hash | foundry worker is a different service | original 8/8 QA allocation is not this budget | read existing grants; do not insert invocations, prices, or refills |
| SDS startup | `server/index.js` loads `createSdsApp` | watch scheduler off unless `MANAGED_WATCH_SCHEDULER=1` | n/a | feature off adds no route and does not materialize the foundry runtime |

Hosted maintained-useful-delivery 0.3.1 is a free library the caller runs. It does not enroll a due lease on the SDS process. This adapter is that missing opt-in path.
