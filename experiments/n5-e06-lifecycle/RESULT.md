# N5-E06 lifecycle receipt

Synthetic owner-run consumer. Not a customer, not demand, and not a live quote. vendor-budget-impact output is a supplied-row diff. It is not a bill, a live quote, or purchase authority.

## Bases

| Item | Value |
| --- | --- |
| Declared writer base | `09b2d6155ce247d828355183c9367889daf5f0f0` |
| Declared writer tree | `0619ee40acd45537fe1fde8723d07152ef09508a` |
| Actual writer checkout at the run | `09b2d6155ce247d828355183c9367889daf5f0f0` |
| Actual writer tree at the run | `0619ee40acd45537fe1fde8723d07152ef09508a` |
| Writer branch | `codex/n5-e06-lifecycle-20261105` |
| Input commit | `9f6c0c4e396dd7677f334400eed93e3445fad600` |
| Input tree | `8a85072962a71dc1b78b19a0dc0caf17aebac833` |
| EMBED commit | `1003b9ec6c3d46826f54a398fce4bb6d0821596f` |
| Release history merged into the writer branch | false |

The writer branch starts at main. The input commit is a detached worktree passed with `--source-root`. EMBED 1003b9ec6c3d46826f54a398fce4bb6d0821596f is an ancestor of that input. The input commit is not an ancestor of the writer checkout.

Repeat, without merging that commit into this branch:

```
git fetch origin 9f6c0c4e396dd7677f334400eed93e3445fad600
git worktree add --detach <dir> 9f6c0c4e396dd7677f334400eed93e3445fad600
node experiments/n5-e06-lifecycle/run.mjs --source-root <dir>
```

Admitted blobs, checked with `git ls-tree` and `git hash-object` before import:

| Path | Blob |
| --- | --- |
| server/lib/observatory/maintained-capability.js | `b3691bced66e8c4f42e351d5c96be1962748a2bb` |
| server/scripts/test-capability-owner-lookup.js | `369b11c4f3a55162444c8080ef64881f3d09db4a` |
| client/public/discovery/useful-jobs.json | `de32575ea85e28aa6113b488e76cbb9f1c795b56` |
| client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz | `d8aecf276ce2eb23f4d30f5575085bc992134841` |

## Archive hashes

Hosted bytes were downloaded and hashed before any extract this driver controls. The acquire function checks size and sha256 again before it extracts.

| Pin | Bytes | sha256 | npm integrity |
| --- | --- | --- | --- |
| A 1.4.0 | 2575215 | `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` | `sha512-OR+ZfCqQMZoEmW/UgzKWMrp4T3PoQ1PwQtdP1JtjMCKCnQNildwWkyNtzmUWNDRuyMgyBS47v46Ha/iLlZvWPw==` |
| B 1.4.7 | 5255824 | `e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec` | `sha512-eDKT6Be1gin85rE1BmzNMVG3UGw/IwxNK1X8lzCAvo+HQLKO0vmGAc6YFRjTx73+I0rede5XaCQ+aDw+HYZzKQ==` |

## Commands and exits

Node v22.23.4. npm 10.9.9. Full transcripts: `evidence/commands.jsonl`. Substituted acquire scripts: `evidence/scripts/`.

| Step | Exit | ms |
| --- | --- | --- |
| refuse missing | 2 | 31 |
| refuse writer-checkout | 2 | 33 |
| refuse empty-dir | 2 | 32 |
| curl 1.4.0 | 0 | 355 |
| curl 1.4.7 | 0 | 262 |
| npm install sibling | 0 | 302 |
| pin acquire A | 0 | 376 |
| pin A version | 0 | 27 |
| A vendor-budget-impact | 0 | 186 |
| A feed-agenda | 0 | 202 |
| pin unknown job | 2 | 28 |
| http 1.4.6 | 0 | 113 |
| http 9.9.9 | 0 | 109 |
| curl -f 1.4.6 | 22 | 111 |
| curl -f 9.9.9 | 22 | 108 |
| pin acquire 1.4.6 | 1 | 114 |
| pin acquire 9.9.9 | 1 | 112 |
| pin acquire bad sha | 1 | 292 |
| pin acquire truncated | 1 | 33 |
| pin acquire killed extract | 1 | 45 |
| A vendor-budget-impact | 0 | 182 |
| A feed-agenda | 0 | 211 |
| pin acquire B | 0 | 370 |
| B vendor-budget-impact | 0 | 261 |
| B feed-agenda | 0 | 246 |
| pin remove A | 0 | 6 |
| pin remove B | 0 | 10 |
| pin invoke removed B | 1 | 24 |
| npm install sibling | 0 | 311 |
| npm install A | 0 | 452 |
| A vendor-budget-impact | 0 | 197 |
| A feed-agenda | 0 | 215 |
| npm install 1.4.6 | 1 | 314 |
| npm install 9.9.9 | 1 | 309 |
| npm install truncated B | 251 | 208 |
| npm ci bad integrity | 1 | 620 |
| npm ci recover A | 0 | 341 |
| A vendor-budget-impact | 0 | 197 |
| A feed-agenda | 0 | 217 |
| npm install B | 0 | 635 |
| B vendor-budget-impact | 0 | 239 |
| B feed-agenda | 0 | 250 |
| npm uninstall | 0 | 307 |
| npm invoke removed | 1 | 24 |
| npx removed | 1 | 247 |

Wrong or missing source roots (missing path, this writer checkout, empty directory) exited 2 with `source-root-refused` and created no evidence or workspace files.

## Normal output

Kit-relative labeled samples `samples/pricing/caller-alpha/` and `samples/feed/caller-alpha/`. EMBED named useful-jobs 1.4.7, review newly_reviewed for vendor-budget-impact and inherited for feed-agenda, flags `--before --after`. A discovery document whose version is 1.4.0 is `version_not_approved`. `no-such-job` is `unknown_need`. The call used `bindCapabilityCall` plus optional `--out-dir`.

| Run | vendor-budget-impact digest | feed-agenda digest | feed events |
| --- | --- | --- | --- |
| Pin A | `0c8a43129eaa451a` | `9566ea587f0e4af9` | 2 |
| Pin B | `0ea6c814c944ec14` | `9566ea587f0e4af9` | 2 |
| npm A | `0c8a43129eaa451a` | `9566ea587f0e4af9` | 2 |
| npm B | `0ea6c814c944ec14` | `9566ea587f0e4af9` | 2 |

A summary: Budget-impact scan: fieldChanges=1 unitChanges=0 conflicting=0 unknown=0. The A action has no beforeValue and no delta. B action: before 1.25, after 1.75, delta 0.5, unit USD/1M-tokens, scope billCalculation false, liveQuote false. Feed JSON matches across A and B except `generatedAt`. Feed ICS matches except a possible `DTSTAMP` difference. Saved feed files in the consumer `kept/` directory stayed byte-identical through update and remove.

Unknown job at A exited 2.

## Cost against the baseline

Both routes are baselines. No third helper was added.

| Cost | Pin change | npm |
| --- | --- | --- |
| Harness download and hash, once | 672 | 672 |
| Setup wall ms, after that download | 900 | 789 |
| Review wall ms (first use of both jobs) | 417 | 415 |
| Amendment wall ms (update, second review, remove) | 890 | 1894 |
| Of which the B install | 370 | 635 |
| Failure-injection wall ms | 1682 | 2208 |
| Recovery wall ms | 0 | 341 |
| Hand edits of pin constants | 6 | 0 |
| Recovery file restores | 0 | 2 |

Pin setup is: copy the fixture, `npm install` the sibling, substitute bytes, sha256, and version in the documented acquire function (3 edits), run it. Pin amendment is those 3 edits again for 1.4.7, run it, `rm -rf` the old root, then `rm -rf` the 1.4.7 root. npm setup is `npm install` then `npm install <A url>`. npm amendment is `npm install <B url>` and `npm uninstall useful-jobs`. npm writes package.json and the lockfile; the person does not hand-edit hashes on that route.

Review is the two job commands and the digest comparison. Total driver wall ms: 10165.

## Falsifier outcome

1. Install A from the hosted URL produced runnable useful-jobs 1.4.0. The labeled sample is actionable. Package digest `0c8a43129eaa451a`. The pre-dispatch probe hex `4cf1620d170c8435` was not reproduced.
2. After update to B, package digest `0ea6c814c944ec14` with delta 0.5 USD/1M-tokens. Feed-agenda stayed digest `9566ea587f0e4af9` with 2 events on both pins and both routes. The pre-dispatch probe hex `b8245c80c8880801` / `5cce807b297f4972` was not reproduced.
3. After removing the installation, the removed path exited non-zero (pin status 1, npm status 1). `npx --no-install useful-jobs version` exited 1 and did not recreate `node_modules/useful-jobs`. Versions 1.4.6 and 9.9.9 returned HTTP 404 and non-zero acquire/npm status. Unrelated consumer files, the sibling dependency, and the saved feed output did not change.
4. A wrong sha256, a truncated B body, and a tar process killed mid-extract all returned non-zero, left no new work directory, and left A runnable at digest `0c8a43129eaa451a`. npm install of a truncated B archive exited 251 and left 1.4.0 in place. `npm ci` with a wrong integrity exited 1 and removed A (true). Recovery was `npm ci` from the saved A lockfile, exit 0, 341 ms, digest `0c8a43129eaa451a`.

The ordinary acquire pin change and npm tarball install both complete install, use, update, and remove. No installer was added. Probe digest reproduced: false.

## Limits

- The package digest hashes caller path strings. These runs passed kit-relative sample paths, so the digest is stable for that invocation and differs from the pre-dispatch probe hex.
- Hosted immutability here means the caller checked sha256. This run did not rebuild either archive from source commit 27f0730604adf236e0f3ad818a30b5f43be6e656.
- EMBED derives flags by reading the input tree's copy of the 1.4.7 archive. That copy matched the hosted sha256. Successful installs downloaded the hosted URLs. The truncated body and the killed extract used a separate local origin process serving those already verified bytes, with `USEFUL_JOBS_ORIGIN` set only for those two acquires.
- The consumer is synthetic and owner-run. No adoption or effort-avoided claim beyond the timings above.
- `npm ci` deletes `node_modules` before the integrity check, so a bad update lock needs the saved lockfile restored and `npm ci` again.
- `npx --no-install` queried the public npm registry and was refused. It did not download the hosted archive.
- No deploy, no package publish, no change to hosted archives or discovery JSON.

## Maintained user route

See [USER-ROUTE.md](./USER-ROUTE.md). Ordinary npm of the hosted tarball is the maintained path; no installer.

## Source binding (2026-11-05)

Original cold receive bound to runner `a3efc2c40a246456c7909806a986442a862adfe8` (see BINDING.md). Original RECEIPT head PENDING is superseded by that bind; no D/P/M rerun.

## Producer gate (2026-11-05)

`cold-dpm.sh` records `executed` separately from `qualifiedHistorical`, exits nonzero on any FAIL stage, and marks executed head `unknown` for unproven detached copies. Original cold RECEIPT/binding preserved; no successful-install rerun for clock refresh. See BINDING.md and `cold-dpm-producer-regression.sh`.
