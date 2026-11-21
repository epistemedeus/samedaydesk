# ROOT5240 source handback

The machine guide now emits `Email: contact@neomorphic.io`. Only that line in
`client/public/llms.txt` changes. The direct public file is the owning producer;
Vite copies it and the production static mount serves it. Apex declarations link
to the guide. The gateway projector owns its marked block only. Reviewed the
configured client build, projector, declarations and four requested test files.
The human Footer's separate literal remains unchanged for Root's review.

The admitted branch and canonical origin are preserved, based on installed
`9bb1519768a22a8ac283408cfbbf3b7b477e860c`. Integrate against existing
`codex/root4550-sds-consumer-integration-20261023`, not different main `a5b40cb`.
Operating inputs are frozen Pilot `0f914690533080bb5661234b47eaf23ed6489f66`.

## Executed qualification

- Both full `npm run build:managed-contributor` runs pass with identical explicit
  inputs. Existing locked dependencies install from the offline npm cache.
  The existing sealed product runtime was copied locally from root4000; both
  configured materializer runs report `present`, and managed probes/artifact
  verification pass. No new runtime, dependency or lock change.
- Before editing, froze all 352 actual emitted files (59,950,545 bytes) outside
  Git. After building, raw byte comparison finds exactly one changed path,
  `llms.txt`. All 139 HTML files and all 212 other emitted files are raw-equal,
  including all 40 files under `assets/`. No normalization or baseline rewrite.
- The guide equals its before bytes with exactly the contact line replaced.
  Before SHA-256: `bd02e6d0a9e761e6d4fd007234b7767556ec2dbb87b1adb77f5d66b683d1f1a6`.
  After: `0414d70807f95709e0f00cc528641154644990a60b9dfb5ee4aa46eb4b161153`.
  The paused gateway block and emitted `discovery/paid-gateway.json` are raw-equal.
- Captured 369 local production-static HTTP response bodies before and after,
  including human routes/assets and unknown-route refusal. Exactly `/llms.txt`
  differs; 368 original raw bodies are equal. Both original summary logs receive
  368 HTTP 200s and one 404; the guide is HTTP 200, `text/plain; charset=utf-8`.
- The focused contact regression fails on the stale emitted guide, then passes
  after repair. It checks actual built/source guide agreement, GET with both
  plain-text and HTML Accept, exact contact, stale-contact absence, and HEAD.
  The existing production fixture inherits `NODE_OPTIONS` to preserve the heap cap.
- Four requested focused files yield 24 passed tests, zero failures. Excluded
  the gateway test named `the real update command emits restored, paused and
  unknown machine files in an isolated source fixture`, because it invokes
  projector `--receive`. No such invocation was made.

Reusable focused command, after building with the same inputs:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  '--test-name-pattern=^(?!the real update command emits)' \
  server/scripts/test-gateway-availability.js \
  server/scripts/test-machine-discovery-journey.js \
  server/scripts/test-spa-fallback.js server/scripts/test-spa-route-shells.js
```

## Limits and self-review

An initial comparison failed because the runner's command receipt filenames
collided with the receiver's per-response metadata manifests. The original raw
bodies and summary logs survived unchanged. The corrected comparator uses the
executed receiver's deterministic path ordering and compares those original raw
files. Individual other response status/type metadata is unavailable; no full
per-response header equality is claimed. Failure details remain in the external
qualification directory. No recapture or alteration of baseline bytes occurred.

Build inputs explicitly set the five VITE service values empty, use Node
22.23.3/npm 10.9.9, offline locked dependencies, one Rayon/libuv thread and UTC.
This proves local same-input emission, not actual hosted environment equality.
Managed contributor desk material is verified frozen committed serving material,
not a separate desk rebuild. Root owns hosted/production and human postflight.

Self-review receives only the machine contact producer and focused test changes,
plus these two compact evidence files. Human source/copy/layout/offers, backend,
payment/credential authority, gateway state and dependency locks are unchanged.
Commands run serially, with zero model children and Node heaps capped at 512 MiB.
Peak sampled aggregate RSS across measured commands is 903,976 KiB within the
2,097,152 KiB total reserve; 50 ms sampling cannot establish between-sample peaks.
No PR, deployment, mailbox/provider action, mail test or customer-use claim.

Full raw assets, logs, receipts and replay helpers remain outside Git at:
`/home/ubuntu/root-sol-window100337/root5240-sds-machine-support-routing-20261024/qualification/`.
`WORKER-RESULT.json` binds the compact counts and evidence hashes. Final commit,
remote-head readback and export pointers belong in canonical job-root
`WORKER-EXPORT.json`; runner RESULT/RUN/NATIVE metadata is untouched.
