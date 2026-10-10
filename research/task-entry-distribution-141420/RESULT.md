# Task entry distribution 141420

## Disposition

A small installable skill is the distribution package. No current artifact lets a task-bearing agent install a skill, fetch the published original-task archive, and map one public task onto qualification and read.

The package does not add a protocol, a generic wrapper, a dashboard, or a client rewrite. It does not change human pages. It does not enroll a production visitor or send a requester message.

## Source

- Product base: `d701b68954928fc323aa555325ee08fd3806e637` on `main` (merge of PR 294, 2026-10-10T05:06:06Z).
- Skill commit: `b555e84967adb9a090a1ef69446374c7b3ae7d60`.
- Owner-QA correction: `c99bf7972db7d73b72c16bb3272123d9e0ba7e44`.
- Branch: `codex/task-entry-distribution-141420`. The commit that adds this file does not change the four skill files or the dry-run fingerprint. Root may pass that later tip as `--source-commit`.
- Archive pin: sha256 `9b5b9bf82119d7c8c0d4e277e34e85f6e9c0711ed4cfc84017c7a79b47bed887`, 23811 bytes.
- Live readback on 2026-10-10: `GET https://samedaydesk.com/discovery/original-task-correspondence.json` and the archive URL in that document returned that same hash and length. `deliveryPromise`, `acceptance`, and `payment` were false. This was a public GET, not a visitor-entry POST.
- Runtime: Node v22.14.0. `run-info` for `bc-801f3b4c-45ac-41c7-95fb-fb289cd84f4d` names model `grok-4.7` and has no token or `chargedCents` fields.

## Dedup

These current sources do not supply the workflow:

- `https://samedaydesk.com/skill.md` and the apex agent card name the original-task descriptor and say it is not an MCP tool. They do not install a skill and they do not run map, submit, or read.
- `epistemedeus/x402-data-gateway-skills` `skills/samedaydesk-machine-commerce/SKILL.md` blob `dec499771f3db21d7ed507ec417cb721eb422c17` is paid-action preflight on `agents.samedaydesk.com`.
- `skills/received-useful-work/SKILL.md` blob `bea83a57a67d88fa74fcc4140ba09d94c0dab385` discovers and replays library work. It does not fetch this descriptor or run the correspondence client.
- `skills/public-careers-board/SKILL.md` blob `1cf82569a693956b1c089f82ad36fff78f2acf27` reads careers boards. It was not edited.
- ClawHub CLI 0.23.3 search for `original-task-qualification` returned no rows. Search for `samedaydesk` returned only `samedaydesk-machine-commerce`. `https://clawhub.ai/api/v1/search?q=original-task-qualification` returned `results: []`. Publish dry-run reported `latestVersion: null`.
- Product PRs 290 and 291 published the correspondence receiver and the public archive. PR 294 merged acquisition receiving. None of those is this skill.

## Publication artifact

Directory: `distribution/original-task-qualification/`

| File | sha256 | bytes |
| --- | --- | --- |
| `LICENSE` | `89b182818653f416b06ccd3d8953eb293ef541c89d1e69c99c630087a6b73973` | 1063 |
| `SKILL.md` | `7397a15886741a6c7af354f846432f85ba8ef0184f048058e915080273f962e7` | 5088 |
| `references/pins.json` | `5db1800a13f3014b110cf3b3bce82ddb6e1a235312cd4b063d523dd403ed907b` | 489 |
| `scripts/cli.mjs` | `64fe342d69dccd93e41ad738ad07a8b46abba95114143d70c10028722fa6fd3a` | 27403 |

ClawHub CLI 0.23.3 `skill publish --dry-run` reported `status: would-publish`, slug `original-task-qualification`, version `0.1.0`, `fileCount: 4`, fingerprint `98ad0b85c193d2d4b81af90746cf919dc509af6d694a331e42cf3f4ee6868646`. Nothing was published. `clawhub whoami` returned `Not logged in`.

The installed command fetches the pinned descriptor and archive, checks the hash before extract, and runs `server/lib/original-task/cli.mjs` from that extract. Map, stale discovery, unrelated tasks, spend, and missing private continuation are decisions of that client. Submit requires `--submit yes`. Other origins are refused before connect. Cache and the private directory must sit outside the skill. The skill stdout drops `authorization`, registration ids, and project ids. The private directory keeps `registration.secret`, `continuation.json`, and `retrieval.json`.

Every result has separate keys: `acquisition`, `encounter`, `install`, `registration`, `submission`, `disposition`, `delivery`, `acceptance`, `payment`, and `repeatUse`. Null means that command did not observe the stage. The `install` key means the pinned client was extracted into the caller cache. Registry install is a separate observation.

## Owner QA

Command: `node --test --test-concurrency=1 distribution/original-task-qualification.test.mjs`

Result: 4 passed, 0 failed. The cold command ran from a copied skill directory with cwd outside the repository.

Covered:

- Unavailable descriptor (`descriptor_unavailable`), redirect (`redirect_refused`), descriptor hash that is not the pin (`stale_discovery`, archive not downloaded), and archive bytes that do not match the pin (`archive_refused`, no extract).
- Live and fixture acquire: `acquisition.matched` true, sha256 and 23811 bytes as pinned, `submission` null.
- Describe from the extracted client: `deliveryPromise` false, `acceptance` false, `payment` false. The authorization field is absent. The client's public operator locator sentence remains.
- Map of the public task: `submit_existing_correspondence`, `payment` false, `deliveryPromise` false, `acceptance` false, `submission` null.
- Unrelated MCP body: `unrelated_task`. Spend intent: `no_spend`. Retrieve without a private continuation: `missing_private_authority`. A symlinked private directory: `missing_private_authority`. Project id not exported.
- A descriptor with `deliveryPromise: true` is left unchanged on disk and the extracted client returns `stale_discovery`.
- Submit without `--submit yes` does not fetch or register. A non-published origin is `origin_refused` before connect. `--pay` is `payment_refused` before connect.
- Loopback fixture submit, a new process map, and a new process read. First submit: `pending_qualification`, `delivered` false, `accepted` false, `repeatUse` null, registration `present`. Secret, registration id, and project id were not in stdout. Later read: `repeatUse.samePrivateDirectory` true and `submission` null. After a local operator disposition, read reported `delivered` true and `accepted` false. The scoped sentence stayed in `retrieval.json` and was not in the skill stdout.

These fixtures are owner QA. They are not demand, acceptance, payment, or repeat customer use. The loopback submit used one disposable local enrollment. Production visitor-entry was not posted.

## Scanner

Hermes `tools/skills_guard.py` at `NousResearch/hermes-agent` `dce1e9b37581dd62e480a9064dc04a709c2940d3`, `SCANNER_VERSION` `skills-guard-v9`, source `community`.

Verdict: `safe`. Policy: allowed without `--force`. One medium structural finding: executable bit on `scripts/cli.mjs` (`unexpected_executable` / `executable bit set`). The bit was left in place. The documented command is `node scripts/cli.mjs`. The finding was not removed to change the verdict.

`hermes` is not on this VM, so `hermes skills install` was not executed. ClawHub 0.23.3 refused a local folder scan: upload a version first, then `clawhub scan download <slug> --version <version>`.

## Registry authentication route

Root runs this. It was not run here.

```sh
clawhub login
clawhub whoami
clawhub skill publish distribution/original-task-qualification \
  --slug original-task-qualification \
  --name "Original task qualification" \
  --version 0.1.0 \
  --owner epistemedeus \
  --source-repo epistemedeus/samedaydesk \
  --source-commit c99bf7972db7d73b72c16bb3272123d9e0ba7e44 \
  --source-ref codex/task-entry-distribution-141420 \
  --source-path distribution/original-task-qualification
```

After the directory is on the default branch, the Hermes install id is:

```sh
hermes skills install epistemedeus/samedaydesk/distribution/original-task-qualification --yes
```

Do not pass `--force`. After publication, the stored scan is:

```sh
clawhub scan download original-task-qualification --version 0.1.0
```

## Distribution experiment

Name: `installed-skill-encounter`.

After version `0.1.0` is visible on the registry, one task-bearing agent that does not have this repository checkout installs the skill through ClawHub or Hermes. The task wording is: qualify one public SameDayDesk original task for a public page change, using a nonsecret example, expecting a qualification or a useful refusal, and using no wallet. The agent uses its normal skill search and is not given this repository path.

Pass: describe and map both run from the installed command, map `result.action` is `submit_existing_correspondence`, `deliveryPromise`, `acceptance`, and `payment` are false, `submission` is null, and the production visitor-entry enrollment count is unchanged.

Fail: the agent does not select the skill, clones the website instead of the pinned archive, treats the map as delivery, acceptance, or payment, or posts to visitor-entry.

Observation window: starts when the registry shows version `0.1.0`. Ends at the first independent install and map that matches the pass rule, or when the pinned archive sha256 changes, whichever is first. Record encounter, install, and the map disposition as separate rows. Owner QA in this file is not that encounter and is not demand.

## Limits

- No product pull request, main merge, deploy, registry publish, production enrollment, or outbound message.
- `package.json` and the caller-closure pin were not changed.
- No observatory, EIN, or careers files were written.
- ClawHub will not scan the folder until Root uploads a version.
- Hermes CLI install was not executed on this VM.
- A public index listing is not claimed.
