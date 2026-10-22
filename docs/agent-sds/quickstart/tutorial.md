# Tutorial: first unpaid SDS agent result

This is a lesson. Follow it in order. Do not skip the fixture digest check.
Do not pay. Do not call `/extract/batch`. Do not start checkout. Do not
publish to a registry.

Goal: from this repository root, Node 22, no `npm install`, discover the
free agent surfaces from committed fixtures, select an unpaid local offer
for a page-change job you already hold, and preview a reuse observation
without writing a file.

## What you need

- Node.js 22.x
- This checkout as the working directory
- No network. Step 1 uses `preferFixture: true`.

## 1. Discover from committed fixtures

Stdout is JSON. Expect `"outcome": "offline_fixture"`, `"paid": false`,
`"liveObserved": false`. The bodies are historical. Their capture time is
worker-reported, not independently verified current data.

The fixture SHA-256 pins are
`95f951f0b309357f01286fa4a032fdb0830e9633b323a065a1575e8204cc0b2d`
(`agents-llms.txt`) and
`a8723e38d43dac865a90392452978125c91a0e1bb58a5ff33268ba2cd4375564`
(`skills-index.json`).

<!-- follow-the-doc:step id=cold-read -->
```bash
node --input-type=module -e 'import {resolveForAgentsColdRead} from "./tools/presence/for-agents-cold-read.mjs"; console.log(JSON.stringify(await resolveForAgentsColdRead({preferFixture:true}), null, 2))'
```

You should see two sources (`agents_llms`, `agents_skills_index`) with
`"source": "fixture"`. Coverage stays `partial_discovery_not_apex_guide`.
That is not proof you read `https://samedaydesk.com/for-agents`.

## 2. Confirm the fixture digests

`sha256File` only accepts the two committed alternate body files. A path
outside that set is refused.

<!-- follow-the-doc:step id=fixture-pins -->
```bash
node --input-type=module -e 'import {loadCaptureMeta, sha256File} from "./tools/presence/for-agents-cold-read.mjs"; const m = loadCaptureMeta(); for (const a of m.freeAlternates) { const got = sha256File(a.bodyFile); if (got !== a.sha256) { console.error("fixture_integrity_mismatch"); process.exit(1); } console.log(JSON.stringify({id:a.id, sha256:got})); }'
```

Expect two JSON lines, one per alternate, matching the pins above.

## 3. Route a page-change job you already hold

Routing is advice. `"executionAuthorized": false`. `"paid": false`.
`"paymentRequired": false`. This does not run the comparison and does not
buy a second observation.

<!-- follow-the-doc:step id=route-page-change -->
```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
```

Expect exit 0, `"ok": true`, `"selected.offerId": "sdd.page_change_offline"`.

## 4. Preview reuse of an already-held result

Preview does not write. The caller clock is required. Do not invent time
in production; this lesson uses a fixed UTC instant so the follow-the-doc
run is deterministic.

<!-- follow-the-doc:step id=reuse-preview -->
```bash
node tools/result-reuse/cli.mjs preview \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 \
  --clock 2026-09-17T12:00:00Z
```

Expect exit 0, `"ok": true`, `"mode": "preview"`,
`"publicSafeCertified": false`, `"optInRequiredToWrite": true`.

## What this lesson refused

These commands are part of the lesson. They must fail. The follow-the-doc
runner replays them and requires a non-zero exit.

### Complete issue discussion is not an SDS acquisition

Paid HTML extract cannot acquire GitHub issue comments. The router must
return `"ok": false`, `"selected": null`, exit 2, and
`complete_issue_acquisition_unavailable`.

<!-- follow-the-doc:seeded-failure id=complete-issue-discussion -->
```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json
```

### A path outside the fixture set is not a discovery body

<!-- follow-the-doc:seeded-failure id=unknown-fixture -->
```bash
node --input-type=module -e 'import {sha256File} from "./tools/presence/for-agents-cold-read.mjs"; sha256File("../../package.json")'
```

Expect a thrown `unknown_fixture` and a non-zero exit.

### Export without `--opt-in` must not write

<!-- follow-the-doc:seeded-failure id=export-without-opt-in -->
```bash
node tools/result-reuse/cli.mjs export \
  --input tools/result-reuse/fixtures/accepted-page-change.json \
  --task-id vendor-watch --subject vendor-page-result --sequence 1 \
  --clock 2026-09-17T12:00:00Z \
  --out /tmp/sds-quickstart-must-not-write.json
```

Expect exit non-zero and the message
`refusing to write without --opt-in; preview first and inspect included/omitted`.
The `--out` path must not be created.

## What you can do next

- Live free cold-read (still unpaid): omit `preferFixture` as documented in
  `tools/presence/FOR-AGENTS-COLD-READ.md`. That is a different lesson.
- Write a reuse file only after preview, with `--opt-in` and a caller clock,
  as documented in `tools/result-reuse/README.md`.
- For flags and refusal codes, read those helper docs. They are reference,
  not this tutorial.
