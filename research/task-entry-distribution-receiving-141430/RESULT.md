# Task entry distribution receiving 141430

## Disposition

This is a repair of `distribution/original-task-qualification` on the 141420 source. It is not a new wrapper, protocol, client, dashboard, or human page. No publication or production enrollment was run.

The 141420 export at `research/task-entry-distribution-141420/RESULT.md` and branch `codex/task-entry-distribution-141420` are unchanged. The published archive pin is unchanged.

## Source

- Received candidate: `12aae428c1cc61f93e86fb0cb8a480d40c6cb1ac` on `codex/task-entry-distribution-141420`.
- Received CLI blob: `731a2a055d41443c28f063bde9976b64ef556b4a`.
- Received SKILL blob: `ad3a518966f1f4444eb987c88e3c3d78176d3a12`.
- Repair branch: `codex/task-entry-distribution-receiving-141430`.
- Skill and test tip before this file: `5b23b6a56f8fee3de3f2125bade8ceac237a34cc`.
- Repaired CLI blob: `1a4276f2e89cae60223d5dd520745c0116fc2089`.
- Repaired SKILL blob: `6a970a6c381b29943e9c7eeadfeb121f03018984`.
- The commit that adds this file does not change the four skill files or the dry-run fingerprint. Root may pass the branch tip as `--source-commit`.
- Archive pin: sha256 `9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887`, 23811 bytes, path `/for-agents/original-task/original-task-client.tar.gz`.
- Runtime: Node v22.14.0. Model `grok-4.7`, 256k, Fast false. No other model and no child agent. `run-info` for `bc-801f3b4c-45ac-41c7-95fb-fb289cd84f4d` has no token or `chargedCents` fields.

## Original failures

These ran on the unmodified CLI at `12aae428` before the repair. The repro process then stopped the ignoring child.

- A cached `cli.mjs` replacement, with the archive hash and length still matching, was executed. Describe exited 0 and the stdout included `TAMPER_CANARY_CLI`.
- A cached `action.mjs` replacement was executed. Map exited 0 and the stdout included `TAMPER_CANARY_HELPER`.
- Replacing `cache/client` with a symlink to another directory executed that directory. Describe exited 0 and the stdout included `TAMPER_CANARY_LINK`.
- Unparseable `discovery.json` and `source.json` returned `cache_refused` without executing a canary, and the discovery bytes stayed in place. A parsed cache still reported `acquisition.matched: true` and `install.clientExtracted: true` from the saved files alone.
- An existing directory with `sentinel.txt` and `client/SENTINEL` was accepted. Acquire exited 0, deleted `client/SENTINEL`, and left a new extract in `client/`.
- A missing cache path inside the installed skill returned `cache_refused` after creating that empty directory.
- A cached client that ignored SIGTERM was still alive after the 1000 ms timeout. The skill command had not returned. `kill -0` on pid 19815 succeeded. The repro then sent SIGKILL.

## Repair

Each describe, map, submit, read, and acquire proof reads the cached archive, checks the pinned length and sha256, and extracts those bytes into an invocation-owned directory under the temporary root (`otq-141430-`). The client runs only from that extract. The command then deletes that directory only after its real path and inode match the directory just created. An unresolved path is not recursively deleted. There is no second full-file checksum list.

A durable cache is package-owned only when this command created it, or when it already contains the owner marker and only the allowlisted public files. Those files are `cache-owner.json`, `discovery.json`, `source.json`, and `original-task-client.tar.gz`. A `client/` entry may remain and is never executed or deleted. Any other name, including a planted marker plus a sentinel, is `cache_refused` with the tree unchanged. A missing path inside the skill is not created. A symlink cache path or a symlink parent is refused without following it.

Saved discovery or source that does not match the pin is `stale_discovery`. A saved archive whose bytes are not the pin is `archive_refused`. Neither case rewrites the files or downloads again unless the caller passes `--refresh yes`.

`--cache` and the private directory must not be the same path, and neither may contain the other. That refusal is `cache_private_overlap`. Sibling cache and private directories still work. Overlap is decided before any cache write or client start.

`runOwnedChild` bounds tar and the client. Output stops at a fixed cap and the stream is closed. A deadline or cancel sends SIGTERM, then SIGKILL after a short grace, waits for exit, clears both timers, and requires `kill -0` to fail with `ESRCH`. There is no resident guard. A fast client exit 1 with a small JSON stderr remains that client's code.

`install.clientExtracted` is true only after that invocation's private extract succeeds. Cache reuse sets `acquisition.fetched` false and `acquisition.matched` true only after this command has checked the archive bytes. A later read that finds `continuation.json` sets `repeatUse` to local continuation retrieval, with `acceptedUsefulJob` false and `customerDemand` false. `submission` on that read is null. It is not another accepted useful job or customer.

## Publication artifact

Directory: `distribution/original-task-qualification/`

| File | sha256 | bytes |
| --- | --- | --- |
| `LICENSE` | `89b182818653f416b06ccd3d8953eb293ef541c89d1e69c99c630087a6b73973` | 1063 |
| `SKILL.md` | `ab290e204c659c16b2d93c871393f37b30a253de26697301c6ce0c92f344e4ad` | 5516 |
| `references/pins.json` | `5db1800a13f3014b110cf3b3bce82ddb6e1a235312cd4b063d523dd403ed907b` | 489 |
| `scripts/cli.mjs` | `a059f0d1f378484c248ff1a780b1e645fb84f48139676ba1cb57a410331a9f4d` | 37885 |

Skill version in the document is `0.1.1`. Pins and LICENSE bytes are the 141420 bytes.

ClawHub CLI 0.23.3 `skill publish --dry-run` reported `status: would-publish`, slug `original-task-qualification`, version `0.1.1`, `fileCount: 4`, fingerprint `0d123eac9e1ea98775d22ef5f23b8ac8cd431689c9a1c0fa9fe1c9725e901af9`, `latestVersion: null`. Nothing was published. `clawhub whoami` returned `Not logged in`.

## Owner QA

Command: `node --test --test-concurrency=1 distribution/original-task-qualification.test.mjs`

Result: 5 passed, 0 failed. The cold commands ran from a copied skill directory with cwd outside the repository.

Covered, in addition to the 141420 cases that still pass:

- Same-length cached CLI edit and same-length helper edit. Describe and map return the real client decisions. The canaries are absent from stdout. The planted files remain byte for byte.
- `cache/client` replaced by a symlink. The foreign sentinel stays. The real descriptor is described.
- Owned discovery whose archive hash is not the pin, and owned unparseable source. Both return `stale_discovery`, leave the bytes unchanged, and do not fetch. `--refresh yes` fetches again and the next describe reuses that cache (`fetched` false).
- Owned archive with one flipped byte. `archive_refused`, file unchanged, no download.
- Unowned sentinel directory, planted marker plus sentinel, and an existing empty directory. `cache_refused`, snapshots unchanged, no discovery GET.
- Missing cache path inside the installed copy stays absent. An existing empty directory inside the skill stays empty. A symlink cache and a symlink parent leave their targets unchanged.
- Same path, private nested in the cache, and cache nested in the private directory: `cache_private_overlap`, snapshots unchanged, no registration file created. A sibling private directory is mapped and returns `missing_private_authority`.
- Fake `tar` that ignores SIGTERM: `extract_timeout`, `install` null, and the tar pid is gone (`ESRCH`). No `client/` directory is created in the caller cache.
- `runOwnedChild` deadline, output cap, and cancel: errors `client_timeout`, `client_output`, and `client_cancelled`. Stdout is not returned as a success. Each pid is gone. A fast `exit 1` with `missing_private_authority` stays that code.
- Loopback submit, restart map, and read. Later read `repeatUse.kind` is `local_continuation_retrieval`, `acceptedUsefulJob` false, `customerDemand` false, `submission` null, `accepted` false. After the local operator disposition, `delivered` is true and `accepted` remains false.
- Default missing private continuation, `no_spend`, unrelated map, payment flag with no connect, and the live read-only descriptor and archive GET. The live archive still matches the pin. No production POST.

These fixtures are prompted owner QA. They are not independent demand, acceptance, payment, or a customer.

## Scanner

Hermes `tools/skills_guard.py` at `NousResearch/hermes-agent` `dce1e9b37581dd62e480a9064dc04a709c2940d3`, `SCANNER_VERSION` `skills-guard-v9`, source `community`.

Verdict: `safe`. Policy: allowed without `--force`. One medium structural finding: executable bit on `scripts/cli.mjs` (`unexpected_executable` / `executable bit set`). The bit was left in place. The documented command is `node scripts/cli.mjs`.

`hermes` is not on this VM. ClawHub 0.23.3 does not scan a local folder until a version is uploaded.

## Registry authentication route

Root runs this. It was not run here.

```sh
clawhub login
clawhub whoami
clawhub skill publish distribution/original-task-qualification \
  --slug original-task-qualification \
  --name "Original task qualification" \
  --version 0.1.1 \
  --owner epistemedeus \
  --source-repo epistemedeus/samedaydesk \
  --source-ref codex/task-entry-distribution-receiving-141430 \
  --source-path distribution/original-task-qualification
```

Pass the branch tip as `--source-commit` after this evidence commit. Do not pass `--force`.

After the directory is on the default branch:

```sh
hermes skills install epistemedeus/samedaydesk/distribution/original-task-qualification --yes
clawhub scan download original-task-qualification --version 0.1.1
```

## Experiment label

The 141420 name `installed-skill-encounter` is prompted owner QA, not independent demand. This receiving does not start an agent, wait for an install, or count the cold copy, the loopback fixture, or a later local read as a customer or an accepted useful job. It stops at the tested cold copy. No telemetry was deployed.

## Limits

- No product pull request, main merge, deploy, registry publish, production enrollment, outbound message, account change, or spend.
- `package.json` and the caller-closure pin were not changed.
- A pre-existing directory that contains only the owner marker and allowlisted public files is treated as owned. A sentinel or any other name blocks that adoption and is left unchanged. The marker is not a secret.
- The private extract is removed only when its path still resolves to the directory this command created. A failed resolve does not recurse.
- ClawHub will not scan the folder until Root uploads a version. Hermes CLI install was not executed.
- A public index listing is not claimed.
- Fixture `accepted: false` is the client's receipt. It is not customer acceptance.
