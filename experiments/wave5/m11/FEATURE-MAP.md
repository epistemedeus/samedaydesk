# Feature map — W5-M11 caller example corpus

| Field | Value |
| --- | --- |
| User goal | Supply independently valid examples and see real wrapper output differences, instead of kit `--example` / SAMPLE demonstrations |
| Entrypoint | `experiments/wave5/m11/` (`bin/corpus.mjs`) |
| Command | `node experiments/wave5/m11/bin/corpus.mjs run --corpus experiments/wave5/m11/caller-corpora` |
| Engine | PR52 `server/paid-useful-jobs/bin/cli.mjs` (spawned; not reimplemented) |
| State | Offline, unfunded, `sold` always false; SAMPLE members refused as caller corpus |
| Tests | `node --test experiments/wave5/m11/test/*.test.mjs` |
| Account prerequisite | None. Node >= 22. No wallet, chain, or new spend. |
