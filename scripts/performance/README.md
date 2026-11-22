# SameDayDesk B4 candidate and native retest

This branch is separate from live and grand-phase/redo. Root owns N12 admission,
merge and deployment. No performance pass is claimed by the builder.

The received archive SHA451fbf816cd4badb6f1f557fd76b8dfbeda8871cf9fa44f37f3f1d436c45697c
contains perf/out/sds/b4.json: d4190b9a,14 pages, five valid runs each,9 pass/5 LCP fail.
Failures: /3046.900ms, /x4023224.913ms, /for-agents2587.886ms,
/receipts2889.032ms, /for-agents/useful-jobs2610.657ms. Every CLS/TBT is within budget.
The budgets remain2500ms/0.1/200ms. Those original rows are never relabelled.

The exact admitted run.mjs hash is
9780ee3658ceff01e41f589e9b530ecf404165cb4521df63e97c2ff25e5129a1.
Its serve.mjs selects empty index/route shells even though that original d419
archive contains completed anonymous HTML under route-shells/.public-first-render.
Live GETs and the production Express mount select the latter. The old numbers
measure the CSR transport, not production's existing prerender path. Both profiles
are explicit below; correcting the preview is not itself an LCP budget pass.

The product repair discovers the existing three local Latin font faces before
stylesheets on all anonymous prerenders. Home and receipts previously lacked
these hints. CSS, font files, page markup/copy, all animations, JS, analytics,
account/payment producers, prices and query-selected/private shells are unchanged.
The performance adapter imports the maintained production static mount, rather
than copying its route mapping. APIs have no backend and return404. It preserves
query fallback, HEAD/status and compression; no provider or private snapshot binding.

## Build and package on the builder, no Lighthouse

On the exact clean committed candidate, with inode use below90%:

```sh
npm run release:check
npm run build:managed-foundry
node --test scripts/performance/preview.test.mjs
node scripts/performance/export-preview.mjs --out /ABS/NEW-EXPORT-DIR
```

The export uses npm's frozen offline runtime install for existing Express and
compression dependencies. It includes exact client/dist, the production mount's
small public source closure, a portable installed runtime and preview-source.json.
No env, credentials, PostgreSQL data or API implementation is packaged. Verify the
archive SHA/size against receipt.json, extract on N12 with --strip-components=1,
and use a new output location. Verify every archive member stays under package/.

## Root's N12 receiving, after the batch and serial with EIN diagnostics

The actual admitted N12 boot is8f6e9268-3637-4e23-b3d2-b2d36b57c4dd; its existing
VM-wide advisory lock is /tmp/pilot-grand-phase-lighthouse.lock. These entrypoints
reject the shared builder before importing Lighthouse and take that SAME lock
nonblocking. No competing job, automatic retries or new resident monitor.

For original-source causal evidence, receive only capture-lcp-diagnostic.mjs from
this exact candidate through GitHub contents API. It adapts EIN ae68a81e's4170byte
recipe. On N12, use the unchanged original packet and original d419 preview:

```sh
node capture-lcp-diagnostic.mjs \
  --packet /tmp/pilot-b4-preview-n12-20261122/perf \
  --preview /tmp/pilot-b4-preview-n12-20261122/perf/previews/sds \
  --source d4190b9affb6453a355518369de91dcd9717d703 \
  --expected-boot 8f6e9268-3637-4e23-b3d2-b2d36b57c4dd \
  --lock-file /tmp/pilot-grand-phase-lighthouse.lock --out /ABS/NEW-CSR-DIAGNOSTIC
```

An optional second serial diagnostic uses that SAME original preview/source plus
--production-mount /ABS/CANDIDATE/scripts/performance/preview-server.mjs. This
compares original CSR transport with the real production mount; the mount's source
is unchanged from the baseline. Each retains LHR, Trace and DevtoolsLog for the five
failed paths. Single diagnostics are not five-run B4 passes. Preserve both outputs.

Then retake all14 admitted paths on the candidate (not only the five old failures):

```sh
node /ABS/CANDIDATE/scripts/performance/run-n12.mjs \
  --packet /tmp/pilot-b4-preview-n12-20261122/perf \
  --preview /ABS/CANDIDATE --source FULL_CANDIDATE_SHA \
  --expected-boot 8f6e9268-3637-4e23-b3d2-b2d36b57c4dd \
  --lock-file /tmp/pilot-grand-phase-lighthouse.lock --out /ABS/NEW-RETAKE
```

The wrapper verifies source/file hashes, original runner/budgets and every original
page. It reuses the original run.mjs and installed Lighthouse13.6.0/Puppeteer25.16.0
in a temporary workspace with the production HTTP adapter. The unchanged runner
waits for load below1 before every run, requires five valid traces/page and writes
metrics/b4.json. Only Root's actual resulting JSON can establish numeric success.

The b0 parent CSS differs from the original d419 baseline; retain that provenance.
Live remains separately received at PR414/f907062, Hostinger01a200e8 completed01:41:29.
Neither this branch nor its diagnostics changes live, main, Stripe or host settings.
