# How-to: useful-jobs 1.4.7

Recipes for an agent that already acquired the kit (see
[tutorial.md](tutorial.md)). Each section is one goal.

`$kit` is the directory printed by `useful_jobs_acquire`. Keep caller files
under `$PWD` so paths stay valid after the acquire function returns.

## Run a job on held files

Use caller paths, not `--example`, when the files are yours. Two different
OpenAPI callers must not produce the same digest.

<!-- follow-the-doc:step id=caller-alpha -->
```bash
node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief \
  --before "$kit/samples/openapi/caller-alpha/before.yaml" \
  --after "$kit/samples/openapi/caller-alpha/after.yaml" \
  --used "$kit/samples/openapi/caller-alpha/used.json" \
  --out-dir "$PWD/out/caller-alpha"
```

Expect exit 0, `"ok": true`, and files under `$PWD/out/caller-alpha`.

## Repeat on a changed input

Copy the after-file, edit the copy, write a **new** `--out-dir`. Do not
overwrite the first caller file.

<!-- follow-the-doc:step id=caller-repeat -->
```bash
cp "$kit/samples/openapi/caller-alpha/after.yaml" "$PWD/caller-alpha-after-edit.yaml"
printf '\n# operator edit\n' >> "$PWD/caller-alpha-after-edit.yaml"
node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief \
  --before "$kit/samples/openapi/caller-alpha/before.yaml" \
  --after "$PWD/caller-alpha-after-edit.yaml" \
  --used "$kit/samples/openapi/caller-alpha/used.json" \
  --out-dir "$PWD/out/caller-alpha-repeat"
```

The repeat digest must differ from the first caller-alpha run.

## Compare a page you already extracted

`page-change-offline-job` does not fetch and does not accept `--example`.
Supply a job document whose sibling before/after JSON is already on disk.

```bash
node "$kit/bin/useful-jobs.mjs" run page-change-offline-job \
  --job "$kit/samples/page/h04-page-01/job.json" \
  --out-dir "$PWD/out/page-h04"
```

## Refuse a bad archive before extract

If the download is the wrong size or digest, do not extract and do not run
the CLI. The acquire function in the tutorial already does this: it deletes
the temp directory and returns non-zero. The 1.4.7 pin is `5255824` bytes
and SHA-256 `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec`.

Seeded failure (the follow-the-doc runner poisons the HTTP body to
`5255824` bytes of `0x5a` and replays the **same** acquire function):

- expect acquire exit non-zero
- expect no `useful-jobs-1.4.7/bin/useful-jobs.mjs` on disk from that attempt

Id: `digest-mismatch`. Fixture: [fixtures/seeded-failures.json](fixtures/seeded-failures.json).

## Refuse a run that is missing required inputs

Do not invent the missing after-document.

<!-- follow-the-doc:seeded-failure id=missing-required-inputs -->
```bash
node "$kit/bin/useful-jobs.mjs" run api-upgrade-brief \
  --before "$kit/samples/openapi/caller-alpha/before.yaml"
```

Expect exit non-zero. Stdout or stderr matches `missing-required-inputs` or
`required`.

## Refuse `--example` on page-change

Labeled samples are not a delivered watch for this job.

<!-- follow-the-doc:seeded-failure id=example-on-page-change -->
```bash
node "$kit/bin/useful-jobs.mjs" run page-change-offline-job --example
```

Expect exit non-zero. Stdout or stderr matches `sample_as_delivered_watch`
or `SAMPLE`.

## Stay on the free local package

These jobs never start a paid hosted extract. If the task is "download a
complete GitHub issue discussion from the merchant," stop and read
`tools/offer-routing/README.md` instead. That is a different surface.
