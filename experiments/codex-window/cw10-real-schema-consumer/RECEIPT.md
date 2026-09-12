# CW10 execution receipt

- Execution: native ChatGPT Work Linux VM, Node `v24.19.0`.
- SameDayDesk input: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`.
- Released archive: useful-jobs 1.4.0, SHA-256
  `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
- Upstream current input: `octokit/webhooks`
  `7dd7fa56498a827a08b71919fae89428f5e8e283`.
- Upstream before input: `237b6924bcbfd2d0d36e7233d36c2c6bc21fa2a2`.
- Upstream change: `e69d6eca4e5f1505afacd0677c4303877caca0d6`.

## Observed result

The released CLI completed with exit 0 but returned `informational`, zero
breaking, zero compatible and zero unknown rows. Independent AJV Draft 7
validation returned:

- `saved-membership.json`: before valid, current invalid;
- `migrated-changes.json`: before invalid, current valid.

The current failure is load-bearing: `changes` is required and the legacy
`membership` property is forbidden by `additionalProperties: false`. The
fixture-manifest JSON Patch is the minimal migration for this saved fixture.

## Checks

- Consumer tests: **3 pass, 0 fail, 0 skip**.
- Read-only CI example: **pass**; it re-ran the released CLI and all 3 tests.
- Full released-archive suite: **8 pass, 7 fail, 0 skip** in this VM. All seven
  failures originate in the archive's nested vendor extraction attempting to
  restore uid/gid 1000; the CW10 engine command does not traverse that path and
  passed. This is reported as an environment/archive limitation, not a CW10
  product pass and not a proposed shared-engine edit.

No external pull request, comment, email, payment, deployment, provider credit,
or production/default-branch action was performed.
