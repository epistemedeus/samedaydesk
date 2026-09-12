# h04-ap-unsup-html-lock

Synthetic tiny **caller** HTML used as lockfile before/after.

Not copied from W4 SAMPLE `tools/lockfile-pin-delta/fixtures/html/not-a-lock.html`.

`looksLikeHtml` in M01 `tools/lockfile-pin-delta/lib/parse-lockfile.mjs` matches `^\s*(<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>])`. This file starts with `<!DOCTYPE html`, so the refuse code is `html-input`.

Yarn Berry `yarn.lock` refusal already lives at `examples/lockfile-public/set-b/h04-lock-pub-b06-refuse` (`parse-error`). This case is HTML, not Yarn.
