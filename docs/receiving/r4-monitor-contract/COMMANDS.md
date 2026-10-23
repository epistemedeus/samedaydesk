# Commands actually executed

All commands ran on the admitted Cursor VM, from the preserved product working
tree unless noted. Tests ran serially; no model child or browser was started.
Only fixture TLS keys/tokens were generated, kept under owned disposable /tmp
paths and removed with their fixture. Credentials were never exported.

1. Identity: `git status --short --branch`, `git rev-parse HEAD HEAD^{tree}`,
   receipt `sha256sum`, and programmatic exact-origin comparison. Initial head
   was `79fbd37d31aabdc790248443c576a2f0017e55f0`, tree
   `9e7c8c1bb1f513841117d9d7d3bd5ef49839f501`.
2. Read all staged operating inputs, SPEC and frozen R4 files. Research was
   extracted with `git --git-dir=<staged inputs/source-0.git> archive
   75654b3ae7d959ceeddcb240fb2cddc7844b8653
   overview/research/phase-20261023/product-journey-reserve/`. The exact selected
   R4-J03 brief, source excerpts and four monitor HTTP records were read.
3. Prerequisites: Node `v22.23.3`, npm `10.9.9`. PostgreSQL and node_modules
   were initially absent. `sudo -n apt-get update`, then
   `sudo -n apt-get install --no-install-recommends -y postgresql-16` succeeded.
   Package service startup was denied by the VM's existing policy. Only the
   test-owned clusters were started. `NODE_OPTIONS=--max-old-space-size=512
   npm ci --ignore-scripts --no-audit --no-fund` installed 170 packages in 3s;
   manifests and locks stayed exact.
4. Before implementation: `R4_MONITOR_BASELINE=1
   NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1
   server/lib/machine-services/test/monitor-manifest-journey.test.mjs`.
   Exit 1, two real acceptance failures retained in [baseline.tap](baseline.tap).
5. Candidate: `NODE_OPTIONS=--max-old-space-size=512 node --test
   --test-concurrency=1
   server/lib/machine-services/test/monitor-manifest-journey.test.mjs`.
   Initial 1/1, expanded 8/8, then cold extension 9/9 passed. Existing lifecycle
   tests separately passed 28/28. Later self-review amendments and final fixture
   preservation were received in the combined run below.
6. Final combined command, executed through the job-owned sampler:

   ```sh
   python3 docs/receiving/r4-monitor-contract/measure-serial.py \
     --native-record /home/ubuntu/root-sol-window100337/root4431-monitor-contract-20261023/admissions/414ad8ee-7370-438d-9861-eb234c5845a2/NATIVE.json
   ```

   It executes `node --test --test-concurrency=1
   server/lib/machine-services/test/monitor-manifest-journey.test.mjs
   server/lib/machine-services/test/lifecycle.test.mjs` with a 512 MiB V8 heap.
   Eleven mounted/cold PG cases and 28 lifecycle cases pass, zero skips/failures.
   See [final.tap](final.tap) and [RESOURCES.json](RESOURCES.json).
7. `NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1
   --test-name-pattern='checked-in machine and API contracts'
   server/vendor/continuous-monitoring/test/04-entitlement-contract.test.mjs`
   passes 1/1. This focused historical standalone contract case executes no
   scheduled observation: [standalone-contract.tap](standalone-contract.tap).
8. `bash docs/receiving/r4-monitor-contract/replay-baseline.sh` reproduces 0/2
   against the exact predecessor, expected exit 1:
   [baseline-replay.tap](baseline-replay.tap). The admitted branch is preserved.
9. `node --check` for changed modules/test, JSON parsing, `git diff --check`,
   complete allowed-path verification and unchanged protected-file comparison
   pass. No frontend build, production suite, hosted receiving, CI, customer
   use, PR, merge or installation was run or claimed.

For a fresh receiver, PostgreSQL 16, OpenSSL, Node 22 and the existing root lock
are the prerequisites. Use the direct Node command in step 6. The sampler is
optional and takes that receiver's exact admitted native record; do not reuse
this job's process identity on another host. The test itself creates its TLS
cluster and candidate closure, starts the actual createSdsApp mount, and tears
down all of its live listeners, pools and PostgreSQL processes.
