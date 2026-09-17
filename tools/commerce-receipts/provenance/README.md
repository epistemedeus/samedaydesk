# Commerce-receipt contribution provenance

Claimed SDS contribution SHA must bind a **git object**. `git cat-file -t` is
the authority. JSON `objectType` does not bind. A wrong SHA is
`claimed_hash_unbound_object`.

This is a local fixture gate under `tools/commerce-receipts/provenance`. It
does not call the GitHub API, does not move money, does not mutate checkout,
registry, or prices, and does not edit `tools/contribution-provenance` or
neomorphic-io.

```
node tools/commerce-receipts/provenance/cli.mjs --hash 775051602d91
node tools/commerce-receipts/provenance/cli.mjs --hash c0255ac
node tools/commerce-receipts/provenance/cli.mjs --expect-reject claimed_hash_unbound_object --hash c0255ac
node tools/commerce-receipts/provenance/cli.mjs --claim tools/commerce-receipts/provenance/fixtures/valid/sds-pin-commit.json
node tools/commerce-receipts/provenance/cli.mjs --suite
node --test tools/commerce-receipts/provenance/test.mjs
git cat-file -t 775051602d91
```

`--hash 775051602d91` must print `"objectType":"commit"` and exit 0 (SDS
checkout pin). `--hash c0255ac` must exit nonzero with
`claimed_hash_unbound_object` (S134 unresolved-object pin).

## Closed sets

| Field | Values |
| --- | --- |
| `kind` | `contribution` |
| `sourceRepository` | `epistemedeus/samedaydesk` |
| `surface` | `git_commit`, `git_tree`, `git_blob`, `git_tag` |
| `expectedObjectType` | `commit`, `tree`, `blob`, `tag` (optional; must match `cat-file`) |

`surface` must match the object type `cat-file` returns. A commit SHA with
`git_blob` is `object_type_mismatch`.

Payment, checkout, SKU, and facilitator keys are `money_movement`. This tool
does not accept them.

## Object stores

`git cat-file -t` is the authority. JSON does not substitute for it.

1. This repository's `.git` — SameDayDesk objects such as pin `775051602d91`
2. `git rev-parse --absolute-git-dir` from the process cwd

A SHA present in neither store is unresolved, matching
`experiments/s134-record-jobs/PINS.md` (`c0255ac`).

## Non-goals

- Scanning GitHub for contributions
- Treating JSON `objectType` as proof of a git object
- Payment, checkout, registry, or SKU mutation
- Editing `tools/contribution-provenance/**`, `tools/verify/**`, or neomorphic-io
- Cross-party receipt join (separate `tools/commerce-receipts/join` tree)
