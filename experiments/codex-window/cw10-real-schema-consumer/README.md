# CW10 real schema consumer

Read-only maintainer gate for one real GitHub webhook schema revision. It runs
the released SameDayDesk useful-jobs 1.4.0 CLI, then independently validates
complete payloads with AJV (Another JSON Schema Validator) under the schema's
declared JSON Schema Draft 7 dialect.

## Finding

Octokit's official open-source webhook definitions changed
`organization.renamed` at commit
`e69d6eca4e5f1505afacd0677c4303877caca0d6`: root `required` replaced
`membership` with `changes`, and `additionalProperties` remained `false`.

The saved fixture `saved-membership.json` validates at the exact parent
`237b6924bcbfd2d0d36e7233d36c2c6bc21fa2a2` and fails at current Octokit head
`7dd7fa56498a827a08b71919fae89428f5e8e283`. The minimal migration is to remove
`membership` and add `changes.login.from`; `migrated-changes.json` validates at
the current head.

The released SameDayDesk engine reports this pair as `informational` with zero
breaking rows when `/required` is selected. AJV proves the change breaks the
saved fixture. This is therefore a confirmed bounded false negative, not a
claim that 1.4.0 detected the break. See [PATCH-PROPOSAL.md](PATCH-PROPOSAL.md).

## Reproduce

Prerequisites: Node.js 22 or later and the exact extracted useful-jobs 1.4.0
archive.

```sh
cd experiments/codex-window/cw10-real-schema-consumer
npm ci --ignore-scripts
USEFUL_JOBS_ROOT=/path/to/useful-jobs-1.4.0 npm test
node bin/check.mjs \
  --archive-root=/path/to/useful-jobs-1.4.0 \
  --out-dir=/tmp/cw10-report
```

`ci/read-only-check.sh` is the same gate in shell form. It writes only to a
temporary directory and never calls a network or payment surface. The checked-in
`output/` is the observed run receipt.

## Exact pins and review boundary

- SameDayDesk source: `ad9bc7b448cf1f635ff1488affbe206aaf981ac0`.
- Released archive: `useful-jobs-1.4.0.tar.gz`, 2,575,215 bytes, SHA-256
  `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`.
- Archive source commit: `817a00ca226a94b0e198b29fcd06245b2a92adec`.
- Upstream: `octokit/webhooks`, MIT license; exact schema and transitive local
  references are vendored under `fixtures/upstream/organization-renamed/`.
- W5-M15 real pairs were SchemaStore `package.sideEffects` and SameDayDesk
  verified-feed; W5-M06 was the independent synthetic semantics corpus. This
  pair repeats neither.

## Coverage limits

The engine analysis is used only for the two declared pointers. `/required`
array membership is precisely the exposed false negative. Root selection is not
a workaround because 1.4.0 refuses this schema's relative `$ref` references.
AJV validation includes checked-in transitive references and formats, but this
single fixture does not establish compatibility for unsupported combinators,
remote references, or other webhook families. The old payload is a reproducible
fixture composed from official Octokit examples, not captured customer data.
