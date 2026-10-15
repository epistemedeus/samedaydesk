# Finite maintenance consumer shell

One cold read of the retained E11 compatibility-maintenance result. The caller is admitted only when the supplied G2 permission answer matches the E21 interface: distinct consumer, same tenant, admitted later task, and a current E02 `readCurrent` whose coverage includes `accepted_artifact` and whose sharing is `contributor_control_safe_derivative`. The canonical grant is `safe_derivative_only`.

This package applies that predicate. The live `agentInterface.reuse` call stays a pending join. There is no second authority store, ledger, or IOU store. There is no timer, queue, or supplier rerun.

## Retained asset

`tools/ae14-compat-maintenance` on `codex/ae14-e11-compat-maintenance` at `50210d0dbd2e24194c84b486bf31dc3c705ba06b` (implementation `71840cf63454635e5826831080967113b8eb95e2`, receipt `38d4636e47e2541483203176d4984764b4fe4c8e`). The result schema is `samedaydesk.compat-maintenance-occurrence.v1`.

`fixtures/template-result.json` is the output of:

```sh
node tools/ae14-compat-maintenance/cli.mjs run \
  --request tools/ae14-compat-maintenance/fixtures/request-repair-accept.json
```

Occurrence `compat-maint-cedar-1` keeps sku `CC-4`, changes `contractVersion`, and records local acceptance. The shell checks that digest and reads the maintenance view. It leaves the template's quote fields out of its own response.

## Missing behavior

J2 `PINS.json` at `016b38838d1fcc66128e000f39487d044dc497be` lists E11 as `pending-join:E11@50210d0dbd2e24194c84b486bf31dc3c705ba06b` (maintained applicability). The template had no cold caller, so the export was not yet a joined product. This shell is that caller for one finite occurrence. The terminal G2 export itself is still pending: this process does not call E02 `readCurrent` or the E21 retrieve listener.

## Writer

`tools/ae20-e11-maintenance-shell/` on `codex/ae20-e11-maintenance-shell`.

## Later consumer

`J2 maintained-applicability step`.

The E21 contribution handback reader is the other named later consumer, on the same pending terminal export.

## User benefit

A distinct cold client can read one finite maintenance occurrence while the existing safe-derivative permission is current for that tenant and task. The client sees the retained repair: sku kept, contract field changed, reviewer accepted. The same occurrence id returns the same digest. A second presentation of that digest is a readback and keeps `posts` at 1 with `secondPost` false.

## Acceptance case

```sh
node tools/ae20-e11-maintenance-shell/cli.mjs run \
  --result tools/ae20-e11-maintenance-shell/fixtures/template-result.json \
  --authority tools/ae20-e11-maintenance-shell/fixtures/authority-current.json \
  --principal tools/ae20-e11-maintenance-shell/fixtures/principal.json \
  --work tools/ae20-e11-maintenance-shell/fixtures/work.json \
  --now 2026-10-14T17:00:00.000Z \
  --later-task tasklate-cedar \
  --asked safe_derivative
```

The authority file is a contract-shaped `readCurrent` answer for the predicate. It is not a live grant and not a payment receipt. A current answer at that instant returns `code` `maintained`, `disposition` `repair`, `retainedSkuReused` true, `rights` `safe_derivative_only`, and `posts` 1.

These inputs return `used` false:

| Case | Code |
| --- | --- |
| Unrelated tenant | `cross_tenant` |
| Wrong later task, or the source task reused as the later task | `task_mismatch` |
| Safe-only grant asked for raw or private bytes | `wrong_rights` |
| Withdrawn consent (`revoked` or `withdrawn`) | `revoked` |
| Expired permission (`expiresAt` at or before `--now`) | `sharing_denied` |
| Missing permission | `missing_permission` |
| Same occurrence id with the same digest | readback, `secondPost` false |

A session token is ignored. A permission-row `state` of `granted` is not treated as current. A sharing value other than `contributor_control_safe_derivative` refuses. Coverage that adds `raw_bytes` still serves no raw text.

## Commands

```sh
node --test --test-concurrency=1 --test-reporter=tap tools/ae20-e11-maintenance-shell/test/*.test.mjs
node tools/ae20-e11-maintenance-shell/lint.mjs
```

Both are deterministic and model-free. Node v22.22.2. Counts and logs are in `evidence/`.

## Pending joins

Each skipped test names the upstream export and the later consumer.

| Id | Waits on | Pin | Later consumer |
| --- | --- | --- | --- |
| `g2-terminal-export` | `codex/ae14-j2-work-network-composition@016b38838d1fcc66128e000f39487d044dc497be` terminal G2 export `agentInterface.reuse` composed with E02 `readCurrent`, interface `codex/ae14-e21-contribution-handback@2db38faab2f79cd7b3dc3110c54d301834c9611b` | `016b38838d1fcc66128e000f39487d044dc497be` | J2 maintained-applicability step |
| `e21-contribution-handback-reader` | `codex/ae14-e21-contribution-handback@2db38faab2f79cd7b3dc3110c54d301834c9611b` `experiments/ae14-contribution-handback/src/agent.mjs#agentInterface.reuse` | `2db38faab2f79cd7b3dc3110c54d301834c9611b` | E21 contribution handback reader |

## Pins

Every consumed sha is in `PINS.json`. The G2 contract is `experiments/ae14-contribution-handback/INTERFACE.md` at E21 `2db38faab2f79cd7b3dc3110c54d301834c9611b`. `readCurrent` is the E02 service at `89033e06ed6f2a455051ad8612c36394ad87a7a4`. Amend4 notes are pilot `d478ae8621d2f1ac90002e5a248286d784cc283c`.

## Limits

The live authority call, the H harness, and the J2 import of this shell remain `pending-join`. Supplier `4133cde2ad11e7c58e5913c95c4134b253ab7bdc` is not rerun. The finite queue `b0fe7246211318e0df183a733a62c047bae4b4fb` is not copied. No funds move and nothing is published.
