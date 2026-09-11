# Feature map — W5-D28 journey release packet

Thin consumer of SDS52 paid useful-jobs. Not a second runner, not a homepage,
not a live deploy.

| Field | Value |
| --- | --- |
| User goal | Freeze a journey release packet, read it back, and measure a first return job or honestly report absent live return. |
| Entrypoint | `experiments/wave5/d28/` (`bin/cli.mjs`) |
| Command | `node experiments/wave5/d28/bin/cli.mjs pack --out-dir /tmp/d28` |
| Engine | SDS52 `server/paid-useful-jobs/bin/cli.mjs` at `aeef964fa188443078958d9d6d393afae1d542ee` |
| State | `sold: false`; live settlement out of scope; deployed artifact absent; live return absent unless evidence file |
| Tests | `node --test --test-concurrency=1 experiments/wave5/d28/test/*.test.mjs` |
| Account prerequisite | None. Offline. No wallet, facilitator, spend, or new account. |

## Evidence classes

| Class | What this package ran |
| --- | --- |
| owner-qa | Two SDS52 CLI jobs with disjoint out dirs; packet HTTP on 127.0.0.1 |
| fixture | Invented customer evidence; crash CLI; integer termsVersion |
| live field | Absent. No production deploy, recruited buyer, or independent return. |

## Remaining binding

W5-D01 `samedaydesk.paid-useful-jobs.execution.v1` at `6bed72dd` is not on this branch.
Co03 binder and Co17 verify-complete are not copied here.
