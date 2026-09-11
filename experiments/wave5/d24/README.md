# W5-D24 clean-environment CLI/package consumer

Install the current D01 execution CLI, D07 export/import, and Co14 Python
client into a prefix that is not the SameDayDesk monorepo. Invoke them and
retrieve a useful result. This directory does not contain a second kernel.

## Literal local-runtime journey

Node >= 22, Python 3.10+, from the SameDayDesk checkout that has the PR51
useful-jobs archive (this branch includes it):

```bash
node --test --test-concurrency=1 experiments/wave5/d24/test/*.test.mjs

prefix=$(mktemp -d)
node experiments/wave5/d24/bin/clean-env.mjs accept --prefix "$prefix"
# usable files:
#   $prefix/work/budget-out/budget-impact.json
#   $prefix/work/budget-out/budget-impact.md
#   $prefix/work/d01-out/budget-impact.json
#   $prefix/work/export/job-artifacts.zip
```

`accept` pip-installs Co14 from the pinned sibling tree, stages D01 and D07
into mini layouts that only contain those packages plus the catalog/kit/archive
pin files, then runs caller `vendor-budget-impact` and D07 export/import.

## What is not required

- SDS `vendor/`, `package-lock.json`, SPA pages, or homepage
- PYTHONPATH into `tools/python-useful-jobs-client/` on this checkout
- Live HTTP, Postgres, wallet, or spend

## Tested versions (see PINS.json)

Recorded at test time. Do not read this as a future sibling's behavior.

| Input | SHA |
| --- | --- |
| SDS starting ref | `aeef964fa188443078958d9d6d393afae1d542ee` |
| D01 | `6bed72dd22a396134aa5c957933b42c3a5746698` |
| D07 | `5620dcda5a0cd25892914717f8680c12d887632d` |
| Co14 / D08 pin | `4641173163616b76608cbb3beb503f2d94369b25` |

## Remaining for Root / journey owner

1. D08 Wave5 amendments (timeout on `spawn_node`, bind `list` to extracted catalog, treat missing outputs as incomplete). Co14 pin is still sufficient for a useful caller run.
2. D01 packaging: still needs the three pin files at repo-relative paths. Mini-layout works; there is no published npm tarball.
3. Live origin install and recruited-runtime trial belong to D27. This worker does not fetch `https://samedaydesk.com` or spend.
4. Production deploy and catalog publication are out of scope.

## License

MIT. Nested useful-jobs and sibling packages keep their own licenses (`NOTICE`).
