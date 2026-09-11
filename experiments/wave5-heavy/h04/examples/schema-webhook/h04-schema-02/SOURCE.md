# h04-schema-02 — unused additive GitHub webhook field

Primary source: [octokit/webhooks](https://github.com/octokit/webhooks) public `create` event example payload (MIT).

| Side | SHA | URL |
| --- | --- | --- |
| before | `cdd43ea09fca0dc76c6af948b236cb12a7804e2c` | https://github.com/octokit/webhooks/blob/cdd43ea09fca0dc76c6af948b236cb12a7804e2c/payload-examples/api.github.com/create/payload.json |
| after | `bc5f6fd16b0df0e3058512e7d44dcba9ba3e0bb0` | https://github.com/octokit/webhooks/blob/bc5f6fd16b0df0e3058512e7d44dcba9ba3e0bb0/payload-examples/api.github.com/create/payload.json |

Commit `bc5f6fd16b0df0e3058512e7d44dcba9ba3e0bb0` (`feat: schema updates (adds custom_properties field) … ping … create …`, 2024-03-11) is a 245-file example refresh. For `create/payload.json` the **only** structural delta versus parent `cdd43ea09fca0dc76c6af948b236cb12a7804e2c` is `repository.custom_properties: {}`.

Used pin: `/ref`, `/ref_type`, `/pusher_type` (values `simple-tag` / `tag` / `user` on both sides). `/repository/custom_properties` is intentionally **not** in `used.json`. A useful used-path engine must **not** classify this revision as breaking for that caller.

W4 `webhook-drift` at `94c7bfdfeaa99f5e70f341504df3051cc7717f91` emits `status=informational` with `unchangedCount=3` and does not mention `custom_properties`. The useful-job oracle (`expected-report.json`) uses `status=unchanged` / `consumersBreak=false` for the same fact.

`before.json` / `after.json` are the public example payloads (~7 KB), not a copy of W4 SAMPLE fixtures and not the M06 semantic-unit corpus.
