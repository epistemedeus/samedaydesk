# Self-contained original-task distribution 142800

## Disposition

This is one successor of `distribution/original-task-qualification` on accepted source `8ec4893a6dffaf58f642bc32441be343c69b42ee`. Describe and map run the reviewed client that ships inside the skill. Acquire reads descriptor JSON only. Submit and read stay explicit online calls through that same included client. No new correspondence engine, intake writer, human page, price, or payment authority was added.

Published skill `0.1.1` and the public archive were not overwritten and were not uploaded again. The candidate version in this folder is `0.2.0`. Root owns receiving and publication.

## Source

- Accepted distribution source: `8ec4893a6dffaf58f642bc32441be343c69b42ee`.
- Merged main that contains that source: `737944a02e65d5332d5f15525ad3c577cf896446`. The tree diff from the accepted source to that merge is empty.
- Branch: `codex/self-contained-task-distribution-142800`.
- Included client: `c73ea73680a5ae0185abacb4b36c8425ef7b5c05`.
- Execution change: `8e8b7284ae3e84c57aa4fd12c724b42983456b1c`.
- Owner QA: `f53f53abcc712bb1ed2fe136903dd3a28050c306`.
- CLI blob: `2aab00819555e1cdec79d6b978e5f44be225df11`.
- SKILL blob: `154fbb79b45ec2673de12376fd0badccc74b40d6`.
- Manifest blob: `cd163c7bd38386e4997fde10bfa996b53e9d11ae`.
- Runtime: Node v22.14.0. `tar` is used only to extract the already verified included archive into an invocation-owned temp. Model `grok-4.7` on `bc-801f3b4c-45ac-41c7-95fb-fb289cd84f4d`. `run-info` has no token or `chargedCents` fields. No other model and no child agent.

## Original failure

Recorded on unmodified `8ec4893a` before this change. Loopback acquire exited 0, requested the descriptor once and the archive once, and reported `acquisition.source` `public-archive` with `fetched` true. `unshare -Urn node scripts/cli.mjs describe` exited 1 with `descriptor_unavailable`. Install stayed null. The skill could not describe from its own files when the network was denied.

## Included artifact

The candidate copies the published archive into the skill. It does not replace `client/public/for-agents/original-task/original-task-client.tar.gz`. That public file is still sha256 `9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887`, 23811 bytes. The copy was staged in a fresh `otq-142800-` temp and then written under the skill. The temp was removed. The included bytes are that same pin, so this is the accepted client, not a second archive hash.

| File | sha256 | bytes |
| --- | --- | --- |
| `LICENSE` | `89b182818653f416b06ccd3d8953eb293ef541c89d1e69c99c630087a6b73973` | 1063 |
| `SKILL.md` | `f79c881f74911de0f71248e0ba5a3c791ebca87196d5f8c1b489ccd1ec9d16f4` | 7199 |
| `references/pins.json` | `5db1800a13f3014b110cf3b3bce82ddb6e1a235312cd4b063d523dd403ed907b` | 489 |
| `references/included-client.json` | `2ee39fc60a57cb7caaebc2211f05aafe96e50024c9a97cd3c1d3a258ac6931f3` | 3692 |
| `scripts/cli.mjs` | `59b60da5483e96c891bd3217ef936210af6ed03718afe213c83b49151672a60c` | 38535 |
| `client/original-task-client.tar.gz` | `9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887` | 23811 |
| `client/included-discovery.json` | `4c4f85571c4370d4668e1a8ba876f137806363786157768b6db08184904ee119` | 7268 |

`scripts/cli.mjs` remains mode `0755`. `client/included-discovery.json` is byte-identical to `client/public/discovery/original-task-correspondence.json`. Pins and LICENSE are the published `0.1.1` bytes.

Manifest schema `samedaydesk.original-task-included-client.v1`, version `0.2.0`, runtime `node>=22`. It lists the archive pin, the discovery sha256, and 17 member path/sha256/byte rows. Tests recompute those rows from the files. Execution does not trust the manifest as a second checksum list. It hashes the included tar against the pin, parses the members, and requires every file under `client/source` to match the member with the same path. An extra file, a symlink, a path outside the skill, or a missing member is `source_refused`. A tar that is not the pin is `archive_refused`. Neither case runs the client.

The 17 members are the existing public closure: `package.json`, `server/lib/original-task/` (`action.mjs`, `bundled-descriptor.json`, `cli.mjs`, `client.mjs`, `descriptor.mjs`, `envelope.mjs`), and the correspondence and visitor-entry modules already packed in the published archive. `collect.mjs`, `operator-http.mjs`, `event-guard.mjs`, `deps.mjs`, `store.mjs`, `mount.mjs`, SQL, `node_modules`, and `.env` are not members.

## Transport

Describe extracts the included archive and prints that client's descriptor. It does not open a socket. `--discovery-url` and `--refresh yes` do not add a describe request and do not rewrite the cache. `encounter.descriptorUrl` stays null. The output describes the included client, not current hosted availability.

Map does the same unless the caller passes `--discovery-url`. That flag reads descriptor JSON only. A pin mismatch returns `stale_discovery` and does not run fetched code. A matching pin with `deliveryPromise` true is passed to the included client, which returns action `refuse` and code `stale_discovery`, while the saved JSON keeps `deliveryPromise` true.

Acquire always reads descriptor JSON from `--discovery-url` or the pinned public descriptor. It compares the archive pin and then proves an extract of the included tar. It does not request the archive URL. `acquisition.source` is `included`. `acquisition.fetched` stays false. `acquisition.matched` is true only after the included bytes match the pin.

Submit and read use the included client. Submit still requires `--submit yes` and an allowed base URL. A live descriptor passed to submit that fails the no-delivery, no-payment, no-acceptance contract is `stale_discovery` before any post. Read does not fetch a descriptor or an archive. A later read that finds `continuation.json` sets `repeatUse` to local continuation retrieval, with `acceptedUsefulJob` false and `customerDemand` false. `submission` on that read is null.

Relative `--cache`, `--task-file`, and `--directory` are still resolved before the client runs. The caller cache stays package-owned. A `client/` entry and any archive file left in that cache are ignored, not executed, and not deleted by a successful describe. The command does not write the executable into the cache. Unowned directories, symlink caches, symlink parents, overlap, and in-skill cache paths keep the `141430` refusals. `runOwnedChild` still sends SIGTERM, then SIGKILL, bounds output, and requires the pid to be gone.

## Owner QA

Command: `node --test --test-concurrency=1 distribution/original-task-qualification.test.mjs`

Result: 6 passed, 0 failed, 7101.163281 ms. Node v22.14.0.

| Test | duration_ms |
| --- | --- |
| pins match the published archive and the skill names that archive | 1.447126 |
| cold install acquires, maps, and refuses the unsupported cases | 1108.705663 |
| fixture relative paths submit restart and read without treating qualification as acceptance | 1486.033892 |
| live public descriptor and archive match the pin | 407.122875 |
| cached bytes, cache ownership, and owned children stay bounded | 3485.492619 |
| included client describes and maps with network denied and refuses replaced bytes | 265.177809 |

Covered:

- Included tar and source match the published pin and the manifest. The public archive hash is unchanged after the run.
- `unshare -Urn` describe and map succeed from a copied skill with the network namespace denied. `encounter.descriptorUrl` is null. Map returns `submit_existing_correspondence`.
- The same offline map with `--discovery-url` returns `descriptor_unavailable`, does not install a client, and the loopback server records zero descriptor and archive requests.
- A replaced included `cli.mjs` returns `source_refused` with no canary. A flipped included tar returns `archive_refused` and the flipped bytes stay in place.
- A loopback archive body that is not the pin is not requested. Acquire still matches the included pin, writes no cache tar, and leaves no `client/` directory.
- Payment flag, missing descriptor, redirect, and stale descriptor hash do not request the archive.
- A live descriptor with `deliveryPromise` true maps to the client refusal and a submit with that URL does not post or create `registration.secret`.
- Relative-path loopback submit, restart map, and read. Later `repeatUse` is local continuation retrieval. After the local operator disposition, `delivered` is true and `accepted` stays false.
- Cache CLI edit, helper edit, and `cache/client` symlink do not run. A stale or unparseable cache descriptor is left unchanged and does not block included describe. A planted flipped cache tar is left unchanged and does not block included describe. `--refresh yes` on describe does not fetch and does not rewrite the cache.
- Unowned, planted, empty, missing in-skill, symlink, and symlink-parent caches stay unchanged. Overlap is refused. The sibling private directory returns `missing_private_authority`.
- Fake `tar` that ignores SIGTERM returns `extract_timeout`, `install` null, and the pid is gone. `runOwnedChild` covers timeout, output cap, cancel, and a fast exit 1.
- The live test reads the public descriptor and archive itself. The skill acquire on that run reports `fetched` false and `matched` true. Loopback servers show the skill's archive request count is 0.

These fixtures are prompted owner QA. They are not independent demand, acceptance, payment, or a customer. No production visitor-entry was posted.

## Scanner and dry-run

Hermes `tools/skills_guard.py` at `/tmp/skills_guard.py`, `SCANNER_VERSION` `skills-guard-v9`, source `community`. Verdict `safe`. `should_allow_install` returned allowed, reason `Allowed (community source, safe verdict)`. One medium structural finding: `unexpected_executable` on `scripts/cli.mjs`, match `executable bit set`, description `file has executable permission but is not a recognized script type`. The bit was left in place. The vendored tar and source did not add a finding. This local verdict is not a ClawHub moderation field and it is not a claim that every scanner agrees.

ClawHub CLI 0.23.3 `skill publish --dry-run --json` reported `status` `would-publish`, slug `original-task-qualification`, version `0.2.0`, `latestVersion` `0.1.1`, `fileCount` 24, fingerprint `300e74b73003f11bb797d85a7098728065d78553462bcc10c81aa111a7d6851b`. Nothing was published. `clawhub whoami` returned `Not logged in`. The dry-run has no moderation or version-scanner field. Published `0.1.1` remains the registry latest in that response. `hermes` is not on this VM.

## Registry route

Root runs this. It was not run here. Do not pass `--force`.

```sh
clawhub login
clawhub whoami
clawhub skill publish distribution/original-task-qualification \
  --slug original-task-qualification \
  --name "Original task qualification" \
  --version 0.2.0 \
  --owner epistemedeus \
  --source-repo epistemedeus/samedaydesk \
  --source-ref codex/self-contained-task-distribution-142800 \
  --source-path distribution/original-task-qualification
```

Pass the branch tip as `--source-commit` after this evidence commit. Published `0.1.1` stays available until Root chooses to publish `0.2.0`.

## Limits

- No product pull request, main merge, deploy, registry publish, production enrollment, outbound message, account change, or spend.
- `package.json`, `references/pins.json`, and the public archive bytes were not changed.
- Describe does not perform the optional live descriptor read. Map and acquire do, and only as JSON.
- A pre-existing directory that contains only the owner marker and allowlisted public files is still treated as owned. A sentinel or any other name blocks that adoption.
- The private extract is removed only when its path still resolves to the directory this command created.
- ClawHub will not show a version-scanner result for `0.2.0` until Root uploads it. The `0.1.1` disagreement between top-level moderation and the version scanner was not overridden.
- A public index listing is not claimed.
- Fixture `accepted: false` is the client's receipt. It is not customer acceptance.
