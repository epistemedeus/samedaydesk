# Contributor session grant

Split-process grant for the Neomorphic earned-work prototype. Wave5 **W5-E07**
consumes the W4-exchange-06 pack. The owner process calls I01
`POST /v1/contributor-tokens` once and writes the scoped bearer into an empty
directory. The contributor process receives only that file, hashes it, and
claims a reserved fixture task. It never starts with `EARNED_WORK_OWNER_TOKEN`.

HTTP 201 with an empty body is unknown, not success. Grant creation has no
idempotency key. Reconcile a non-idempotent grant from the attempt directory
without posting again and without owner credentials. Contributor claim recovery
replays the stored `Idempotency-Key`. I01 public GET task is redacted and does
not return a reservation id.

Recovery also binds the original bearer fingerprint, origin, method, path, task
and terms. Changed inputs make zero HTTP requests. Each fresh claim needs a new
state directory; an existing attempt cannot be overwritten, even concurrently.
Legacy attempts without a recorded target remain unknown. Interrupted or stalled
response bodies, redirects, unexpected success statuses and 5xx are unknown.

This is a nonsettling prototype. `owed` is not paid and not settled. A local
fixture is not a hosted exchange. A synthetic requester is not a customer.

## Public interface

```sh
node bin/contributor-session-grant.mjs --help

node bin/contributor-session-grant.mjs --role owner prepare-and-issue \
  --base-url http://127.0.0.1:PORT \
  --owner-token-file ./owner.token \
  --out-dir ./owner-out

node bin/contributor-session-grant.mjs --role owner reconcile --out-dir ./owner-out

node bin/contributor-session-grant.mjs --role contributor claim \
  --base-url http://127.0.0.1:PORT \
  --token-file ./owner-out/grant/contributor.token \
  --task-id TASK_ID \
  --terms-version sha256:HEX \
  --state-dir ./contributor-state

node bin/contributor-session-grant.mjs --role contributor reconcile \
  --base-url http://127.0.0.1:PORT \
  --token-file ./owner-out/grant/contributor.token \
  --state-dir ./contributor-state
```

Owner commands: `issue`, `prepare-reserved-task`, `prepare-and-issue`,
`issue-ledger-grant` (F04 later binding only), `reconcile`. Contributor commands:
`claim`, `reconcile`. Optional `--task-file` supplies the create-task JSON
(including a reproduction-bound `e18.specDigest:` summary).

`--out-dir` must be empty for a fresh grant. Never automatically retry an unknown
grant. Do not send `Idempotency-Key` on grant POST. Contributor `issue` is
rejected.

## Authoritative runtime

Live local-runtime boots E01 PR109 `c4048401fa42e1272e61edf983afbf39a3e04555`
tree `1a5dad7755fb81c75564dbc9d3667ab16db9bbcd` via
`scripts/prepare-e01-worktree.sh`. Historical I01 PR54
`346bbd3cbe6943a83b2077c455174d74b7a493ad` remains the extracted OpenAPI
comparison pin. `termsVersion` is a content hash `sha256:` + 64 lowercase hex.
The artifact manifest and current execution receipt identify the runtime head.
Original F01 integer claim keys are rejected here. Hashes at rest match kernel
`hashToken` (SHA-256 of utf8 plaintext), not the F07 harness prefix.

E02 Wave4 SDK pin `50f605e6ef459a500bd3a643165f16b5fbb5d680` is consumed as the
method-map row `createContributorToken` `idempotency:false` only. This pack does
not vendor `packs/earned-work-sdk`. E03 Wave4 job-resume pin
`037fbd0138de3a237536b006d51de89b48e015ad` is not copied; claim replay uses the
kernel Idempotency-Key stored by this pack.

Loopback HTTP only. Node 22. Zero npm production dependencies. Not tsx.

## Tests

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```

Reproducible from this pack on Node 22. `npm test` does not boot a kernel.

PR109 `c4048401fa42e1272e61edf983afbf39a3e04555` (tree `1a5dad7755fb81c75564dbc9d3667ab16db9bbcd`) is an open draft and is not on this checkout. `src/missing-acceptance.mjs` names that gap. Do not run `scripts/prepare-e01-worktree.sh` to manufacture a live proof. Fixture HTTP stubs stay labelled fixture.

Fixture HTTP stubs are labelled fixture. They are not proof of the I01 server
path. External hosted earned-work is untested.

## Non-claims

- Not payment, settlement, or payout authority
- Not a hosted public API
- F04 `POST /v1/grants role=contributor` is a ledger grant, not an earned-work
  claim credential
- Homepage / brand files are out of scope
