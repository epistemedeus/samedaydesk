# Reusable source receiving commands

Run from the admitted SameDayDesk checkout with its lock-resolved dependencies.
The receiver requires Node 22, PostgreSQL 16 binaries, OpenSSL and Python 3 on
Linux. It uses only disposable loopback PostgreSQL/RPC and verified HTTPS.
`run-focused.py` supplies a short TMPDIR, subreaping, 512 MiB Node heap limit,
UV_THREADPOOL_SIZE=1 and OMP_NUM_THREADS=1. It has no parent kill deadline.
The existing wallet crash child uses its smaller explicit 384 MiB heap.

For the actual runs, these identities came from this operation's admitted
EXECUTION.json; they identify the existing owner tree, not an extra reservation:

```sh
export ROOT6712_NATIVE_PID=1142097
export ROOT6712_NATIVE_START=20904532
```

Do not reuse those PID identities on another admission. Omit them for a fixture
only RSS measurement, or supply that admission's independently verified owner.
Earlier runs that named 1142163/20904572 counted the native process and its
children; final runs count the entire admitted runner tree plus test/PG tree.

Exact baseline command (log `baseline-export.tap`, data `baseline-received.json`):

```sh
python3 docs/receiving/root6712-authority-read-critical-path-20261024/run-baseline.py
```

The helper archives exact d310f4cf37fb190d850ac0cea71ec34787972162 into its own
TemporaryDirectory, copies the current focused receiver, reuses the resolved
dependencies and invokes this command, with ROOT6712_EXPECT_SETUP_CALLS=3 and
ROOT6712_EVIDENCE set to the absolute `baseline-received.json` destination:

```sh
python3 docs/receiving/root6712-authority-read-critical-path-20261024/run-focused.py node --test --test-concurrency=1 <owned-archive>/server/scripts/test-root6712-authority-read.mjs
```

Exact corrected command (log `corrected-export.tap`):

```sh
ROOT6712_EVIDENCE=docs/receiving/root6712-authority-read-critical-path-20261024/corrected-export.json python3 docs/receiving/root6712-authority-read-critical-path-20261024/run-focused.py node --test --test-concurrency=1 server/scripts/test-root6712-authority-read.mjs
```

Exact wallet/authority command (final log `wallet-export.tap`):

```sh
python3 docs/receiving/root6712-authority-read-critical-path-20261024/run-focused.py node --test --test-concurrency=1 vendor/hosted-wallet-market/test/account-delivery.test.mjs vendor/hosted-wallet-market/test/machine-profile-admission.test.mjs vendor/hosted-wallet-market/test/machine-profile-receiving.test.mjs vendor/hosted-wallet-market/test/read-lifetime.test.mjs vendor/hosted-wallet-market/test/requester-cancellation.test.mjs vendor/hosted-wallet-market/test/response-completion.test.mjs vendor/hosted-wallet-market/test/response-lifecycle.test.mjs server/scripts/test-hosted-wallet-market-mount.mjs
```

Exact mounted command (log `mounted-regressions.tap`):

```sh
R4_WALLET_DIRECT_SOURCE=1 python3 docs/receiving/root6712-authority-read-critical-path-20261024/run-focused.py node --test --test-concurrency=1 server/scripts/test-r4-wallet-continuation.mjs server/scripts/test-r4-requester-proposal-review.mjs server/scripts/test-root404-cold-requester.mjs server/scripts/test-root410-requester-receiving.mjs
```

Source closure update, executed once after the server change:

```sh
NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=1 OMP_NUM_THREADS=1 node server/scripts/refresh-installed-receiving-source.mjs
```

`source-export.json` and `closure.json` retain the result. This exporter updates
raw wallet source declarations and verifies the frozen Neo closure. It does not
compile Neo, build desk/client assets, qualify a release or install anything.

`git diff --check` and `git diff --exit-code d310f4cf37fb190d850ac0cea71ec34787972162 -- client vendor/neomorphic-contributor-journey vendor/neomorphic-contributor-desk`
both exit 0. `preservation.json` contains the protected inventories/tree IDs.
The historical ROOT255 exact changed-file-set assertion is tied to another base;
it is not selected as a current-tree test. The actual composed managed path is
received by the new test, rather than relabeling the component mount as that path.

First fixture failures and later observations retain their original TAP files;
`RUNS.json` records every test command's observed case/exit/cleanup summary and
log digest. Repeated passes are not added to the final 108-case total.
