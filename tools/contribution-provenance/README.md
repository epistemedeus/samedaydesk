# Contribution provenance

Claimed SHA or signature must bind a **git object**. Solution-shaped text is a
lead. Commenter text is never adoption.

This is a local fixture and `git cat-file -t` gate. It is not a contribution
radar, does not call the GitHub API, does not ping Verantis or x402 Pulse, and
does not mutate upstream pull requests.

```
node tools/contribution-provenance/cli.mjs --hash 072f8d0
node tools/contribution-provenance/cli.mjs --expect-reject claimed_hash_unbound_object --hash c0255ac
node tools/contribution-provenance/cli.mjs --claim tools/contribution-provenance/fixtures/valid/commenter-verantis-pr2.json
node tools/contribution-provenance/cli.mjs --suite
node --test tools/contribution-provenance/test.mjs
git --git-dir=tools/contribution-provenance/fixtures/object-store cat-file -t 072f8d0
```

`--hash 072f8d0` must print `"objectType":"commit"` and exit 0 (Verantis PR2
head, vendored). `--hash c0255ac` must exit nonzero with
`claimed_hash_unbound_object` (S134 unresolved-object pin).

## Closed sets

| Field | Values |
| --- | --- |
| `actorLabel` | `owner`, `member`, `commenter`, `app` |
| `adoption` | `lead`, `object_bound`, `owner_adopted` |

Labels are declared on fixtures. They are not fetched from GitHub.

`owner_adopted` requires `actorLabel` `owner` and a claimed hash that
`git cat-file -t` resolves. A commenter claim with `owner_adopted` is
`comment_text_is_not_adoption` even if the hash binds.

## Object stores

`git cat-file -t` is the authority. JSON does not substitute for it.

1. `fixtures/object-store` — vendored commit `072f8d04026bb29a62dbf8a761a2ae62abbdc663`
2. This repository's `.git` — SameDayDesk objects such as pin `775051602d91`

A SHA present in neither store is unresolved, matching
`experiments/s134-record-jobs/PINS.md` (`c0255ac`).

## Non-goals

- Scanning GitHub for contributions
- Treating issue comment text, signatures-in-prose, or solution-shaped patches as merged work
- Opening, reviewing, or mutating Verantis PR 2 or x402 Pulse threads
- Editing `tools/verify/**`, `tools/bazaar-tracker`, or `tools/evidence-records`
