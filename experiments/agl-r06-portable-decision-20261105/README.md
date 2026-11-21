# agl-r06-portable-decision-20261105

Hypothesis N6-R06: a saved decision plus its public manifest is a portable CC0
artifact that a distinct consumer with no shared Pilot state can reuse, without
running the producer, when the digest of its own capture matches exactly;
otherwise it recomputes.

All inputs under `fixtures/` are synthetic fixtures derived from the
recurring-job-recipes verify fixtures. They are not real outside data.

```bash
node experiments/agl-r06-portable-decision-20261105/harness.mjs   # rewrites RESULT.json
node --test experiments/agl-r06-portable-decision-20261105/test/harness.test.mjs
```

The harness creates two consumer dirs in a temp dir, each with its own HOME and
state dir and its own copy of the fixtures. Consumer A runs
`verification-reconcile`, binds, exports portable decisions and retires one.
Only `commons/*.portable.json` is shared. Consumer B builds its manifest from its
own files and tries `import-decision` first. On a hit it shadow-runs the
producer only to compare outputs (false reuse); on a refusal it recomputes.

Case mix: 8 cases, 2 where B's capture differs from A's, 1 retired manifest.
The hit rate reflects this designed mix, not a real-world rate. Timings are a
single sample and include node startup. Producer, review and upkeep costs are
unknown.
