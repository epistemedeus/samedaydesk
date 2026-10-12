# RECEIPT-221600

Owner: ROOT-HEAVY-OPPORTUNITY-HOST-221600. This is the integrated SameDayDesk host candidate. It does not merge, deploy, inject live credentials, import participants, send mail, post listings, transfer value, or admit production.

## Source and export

- Product: epistemedeus/samedaydesk, branch `codex/opportunity-existing-host-221600`, base `b3f7900e935316728b51d1019f8085fcdca221c0`.
- Received service: epistemedeus/neomorphic-io `d4372bd14281d4b03e079f31b18ce4cb77cf4e7f`.
- Sol export inside that pin: `bce282c5790d5f20dbb541d606a986e5a91500a5`. Its parent is `5d5e63e2b71d9380f503e60771e195cac4d0948b`.
- Root recipient-action amendment, versus the Sol export, is only `src/lib/opportunity-continuation.mjs` and `tests/opportunity-continuation.test.mjs`. Those files stay in the received tree. They are not copied into SameDayDesk pages.
- Vendored closure, repo-relative, byte-identical to the received pin: `services/earned-work`, `experiments/arena/workability-dimensions`, `packs/funded-task-terms`. 180 source files, 0 hash mismatches. Receipts and `node_modules` are excluded. Local `dist` is 100 built files, hashed in `vendor/neomorphic-opportunity/SOURCE-MANIFEST.json`, and is not part of the git pin. Narrow pin: `vendor/neomorphic-opportunity/SOURCE-PIN.json`.
- Mount: `POST/GET` under `/api/neomorphic-opportunity` only. Health, owner-issued `POST /v1/contributor-tokens`, and the received opportunity routes. Kernel task, funding, payout, and kernel OpenAPI routes are not registered.
- Dedicated names only: `NEOMORPHIC_OPPORTUNITY_DATABASE_URL`, `NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN`. Fixed schema `neo_opportunity_221400`. Pool maximum 4. The resident shutdown hook closes this pool inside the existing listener lifecycle. Missing configuration leaves this prefix unavailable and leaves the other host routes up. A configured store that cannot be reached answers `store_unavailable` and does not report ready.
- Public round metadata stays `deliveryState=unconfigured`, with public claim and waitlist paths unset, until Root passes the admission gates below. The received continuation note, replayed from the pin, is: "For current paid evaluation opportunities, email contact@neomorphic.io with your workflow. Wait for slot confirmation before starting."

## Native session

- Model `grok-4.7`, reasoning effort `xhigh`, agent `grok-build-plan`.
- Session `7f9b1f01-6889-4bb4-8e18-ae1d3608dd26`, request `8b6ed3cc-c5ed-4a25-82f5-0d859ddf1eca`, cwd `/home/ubuntu/root221600-control/sds`, created `2026-10-12T07:08:23Z`.
- Runtime: Node `v22.14.0`, npm `10.9.7`. No second model was started.

## Commands and counts

Disposable Postgres 16 on `127.0.0.1:55432`, database `earned_work_test`. The lab role is the one already published in the received 221400/221500 receipts. It is not a production secret. The host suite sets `NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN` to its own test value and does not fall back to the earned-work fixture owner.

| Gate | Command | Result |
| --- | --- | --- |
| First red, before `server/app.js` and `server/index.js` were wired | `node --test --test-concurrency=1 --test-reporter=tap server/scripts/test-neomorphic-opportunity-host.mjs` | 10 tests, 0 pass, 10 fail. Preserved at `docs/receipts/221600/first-red.tap`. Nine failures are `opportunity mount missing`. The resident process returns 404 for round creation. |
| Host, after the mount | same command | 10 tests, 10 pass, 0 fail. Duration 4381 ms. |
| Received opportunity service | `node --import tsx --test --test-concurrency=1 tests/opportunity-intake.test.ts tests/opportunity-openapi.test.ts tests/opportunity-receive.test.ts tests/opportunity-receiving-boundaries.test.ts` inside the vendored service, with `EARNED_WORK_DATABASE_URL` pointed at the disposable database and `EARNED_WORK_OWNER_TOKEN` set to that suite's published fixture token | 36 tests, 36 pass. Duration 13609 ms. |
| Recipient-action amendment | `node --test --test-concurrency=1 tests/opportunity-continuation.test.mjs` in the received tree | 2 tests, 2 pass. The note offers the email next action. |
| Hosted startup | `npm run test:hosted-startup` | 4 pass. |
| Correspondence mount | `npm run test:correspondence-mount` | 9 pass, 1 skipped. |
| Foundry host | `npm run test:foundry-host` | 22 pass. |
| Proxy and caller closure | `npm run test:proxy-addr` | First run after the mount: 5 pass, 2 fail, `caller_source_changed`, because `package.json`, `package-lock.json`, `server/app.js`, and `server/index.js` are sealed. After resealing those hashes and the new closure: 7 pass. Caller base stays `08b90bdef8dbd198023be447942a3119cb268235`. Previous closure `sha256:773bb8a75378282be72b3db794391a4e260c474662a57c7aff5e50edc6d77365` is retained. Current closure `sha256:377ac88bda2568d3527feb21ec07085ad1579d0e13bfaa36e3a76aaf4f22ad12`. |
| Public readiness mount | `node --test --test-concurrency=1 server/scripts/test-public-readiness-mount.js` | 1 pass. |
| Foundry activation | `npm run test:foundry-activation` | 16 pass, including a rerun after the caller-pin reseal. |
| SPA fallback | `npm run test:spa-fallback` | 2 pass. |
| Client packaging | `npm run build` | Exit 0. `client/dist` stays gitignored. `client/package-lock.json` was restored after npm rewrote optional `libc` metadata; that lock hash in the caller pin is unchanged. |

The host gates covered missing and invalid configuration, old route coexistence, prefixed requests, denied owner and other-round and cross-holder use, malformed and oversized evidence, owner-reserved capacity, duplicate and changed imports and submissions, unknown commit acknowledgement with an independent restart, closure and expiry with submitted and owed obligations kept unpaid, null nonpaying acceptance, and clean bounded shutdown. An unlearned import is made while the round is still open. The received service refuses a new import after close or after the submission deadline, and the test follows that rule. Close and a later acceptance still leave the owed records unpaid, with adapter `null_nonpaying_v0` and no kernel obligation.

`git apply --check --reverse tools/hosted-useful-journey-100346/patches/ROOT-MOUNT.patch` fails on `server/index.js:13` and `server/app.js:26`. That failure was already present on the unmodified base. This change does not rewrite that patch.

## Remaining Root steps

1. Review and merge this branch. Do not treat this receipt as a deploy.
2. On the retained Postgres, create a dedicated login that can `CREATE SCHEMA` and own `neo_opportunity_221400`. Boot always migrates. A DML-only role cannot become ready. Do not point `NEOMORPHIC_OPPORTUNITY_DATABASE_URL` at `DATABASE_URL`, `EARNED_WORK_DATABASE_URL`, `CORRESPONDENCE_DATABASE_URL`, or the product Supabase project.
3. Inject `NEOMORPHIC_OPPORTUNITY_DATABASE_URL` and `NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN` only in the private runtime environment. The owner token is at least 8 characters and is not the correspondence admin token, the earned-work owner token, or the fixture owner. Leave both unset until that injection; the prefix then stays unconfigured and the rest of the host stays up.
4. Keep pool max at 4 unless the topology needs 1–4. Leave trust proxy at 0 unless the real hop count is known. Do not set it to `true`. Leave the verifier at `default`.
5. Restart the managed process. Confirm `/api/neomorphic-opportunity/healthz` is ready only after migrate succeeds, and confirm `/api/health` stays up if that database is absent or refused.
6. Prove HTTPS, the holder grant, and a real production admission before any public claim or waitlist URL is configured. Until then the public view stays unconfigured and `hostedClaimAutomation` stays false.
7. Reconcile the private Sent offers. Ten discovery offers at 10000 atomic USDC and three workflow offers at 50000 are assigned. One workflow offer at 50000 remains unassigned and needs owner-confirmed scope before anyone starts it. The fixed round cap is 300000 atomic USDC.
8. Do not run `opportunity-receive.mjs` against retained production from this candidate. Do not grant credentials, migrate retained production, or start a payout. Accepted work stays an owed `null_nonpaying_v0` record. Notice and outbox binding remain private Root work. There is no background reconnect; restart the process after a store failure.
