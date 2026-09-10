# Task → existing offer routing

The local router separates fetching source data from processing supplied evidence.
Paid HTML extraction cannot acquire complete GitHub issue comments. The task kit
packages supplied evidence and historical fixtures; it does not fetch complete
comments either. A genuine `complete_issue_discussion` job returns `ok: false`,
`selected: null`, exit code 2 and `complete_issue_acquisition_unavailable`.
The new issue-evidence acquisition pack is not advertised as published here.

The [capability-limits matrix](capability-limits-matrix.json) lists capabilities
and limits. Routing matches a job type and payment constraints; acceptance criteria
remain `not_evaluated`, and `executionAuthorized` is false. `paymentRequired` means
an offered remote request would cost money; `paid` is always false for routing.
No result promises useful output or forces a paid fallback.

Run from the repository root with Node, no install:

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/complete-issue-discussion.job.json
```

That command deliberately exits 2 for the missing acquisition capability. These
commands select supported local processing or rehearsal, without fetching inputs:

```bash
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/supplied-issue-brief.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/page-change-evidence.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/cross-workspace-correction.job.json
node tools/offer-routing/route-job.mjs tools/offer-routing/fixtures/moltjobs-sdk-rehearsal.job.json
```

The task-kit literal compose command is run from the extracted package directory,
not this repository. Follow its public guide for acquisition. The result-reuse
literal command uses a fixed fixture timestamp and a fresh local output directory.

Hosted pages/downloads are separate from execution. The MoltJobs unhosted sample
runs synthetic bid/start/submit against a disposable local HTTP fixture, not the
live marketplace. Its shipped runner refuses `--live`; adding credentials or
hosting does not enable it. The trial page is hosted but builds a brief locally
in the browser. Local tools do not need hosting: “offline until hosted” is not a
prerequisite. No provider or earnings claim is made.

```bash
npm run test:offer-routing
```
