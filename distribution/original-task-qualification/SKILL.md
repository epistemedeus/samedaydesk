---
name: original-task-qualification
description: "Qualify one public SameDayDesk original task with the published correspondence archive and read that private attempt. This is not delivery, acceptance, or payment."
license: MIT
compatibility: Requires Node.js >=22 and tar. No wallet, signup, or API key. The installed command fetches the pinned public descriptor and archive, then runs the extracted correspondence client. Loopback origins are owner QA only. Any other origin is refused before connect.
metadata:
  author: neomorphic
  version: "0.1.0"
  hermes:
    tags: [original-task, correspondence, qualification, no-spend]
  openclaw:
    requires:
      bins:
        - node
        - tar
---

# Original task qualification

Use this when the caller has one public SameDayDesk original task and needs that task qualified through the published correspondence client, then read back from the same private directory. A description match does not run the task. The installed command is `scripts/cli.mjs`.

This skill does not clone the website. It does not enroll by itself. Fetching the descriptor does not submit a task, spend funds, or promise delivery. Pending qualification is the ordinary submitted state. It is not delivery, acceptance, payment, or repeat use.

The supported public task is the correspondence request: objective, publicInput, usefulOutput, and friction. Spend, a paid gateway, an MCP tool call, observatory work, and hosted execution stay refusals from the extracted client. A source label on the task is not authentication.

## Caller input

Pins live in [references/pins.json](references/pins.json). The default descriptor is that discovery origin and pathname. The archive hash and byte length in the pins are the only archive this command extracts. A descriptor that names a different hash is stale. Bytes that do not match the descriptor hash are refused before extract.

```sh
node scripts/cli.mjs acquire --cache CACHE
node scripts/cli.mjs describe --cache CACHE
node scripts/cli.mjs map --cache CACHE --task-file task.json
node scripts/cli.mjs submit --cache CACHE --base-url https://samedaydesk.com/api/correspondence --directory PRIVATE --task-file task.json --submit yes
node scripts/cli.mjs read --cache CACHE --directory PRIVATE
```

`--cache` is a directory whose parent already exists, and the cache itself must sit outside this skill. `PRIVATE` must also sit outside this skill. The cache receives the public descriptor, the public archive, and the extracted client. It does not receive `registration.secret`, `continuation.json`, or `retrieval.json`. Those stay in `PRIVATE`.

`--submit` must be the value `yes`. Without that pair the command does not register and does not post. `--pay`, `--settle`, `--sign`, `--wallet`, and `--purchase` are refused before any fetch.

`--discovery-url` may be the pinned public descriptor or the same pathname on loopback `127.0.0.1` or `localhost`. `--base-url` may be `https://samedaydesk.com/api/correspondence` or that same path on loopback. Credentialed URLs, queries, fragments, and other origins are refused before connect. Redirects are not followed.

`--timeout-ms` is 1000 through 60000. The default is 20000. `--refresh yes` fetches again. `read` uses the cache already acquired and does not fetch.

Map may receive `--directory` and `--handle`. The extracted client decides whether a continuation is present and whether a handle belongs to that directory. This command does not invent a handle.

## Observations

Every result is one JSON object. These keys are separate observations: `acquisition`, `encounter`, `install`, `registration`, `submission`, `disposition`, `delivery`, `acceptance`, `payment`, and `repeatUse`. Null means this command did not observe that stage. It does not mean the stage succeeded.

`install` here means the pinned client archive was extracted into the caller cache. Installing this skill into Hermes or ClawHub is a different observation and is not implied by that field. `registration` is `present` or `absent`. The command does not print the registration id or the registration file. `repeatUse` is set only when a later read finds the private continuation already in that directory.

Exit 0 is a classified result. Read `result.action` and `disposition`. A refusal decision is still exit 0. Exit 1 means the descriptor was unavailable, the archive did not match, confirmation or the runtime was missing, the origin was refused, or the extracted client failed.

Owner QA fixtures are not demand. They are not acceptance and they are not payment.

## Install

This document does not claim that a public index already lists the skill. Directory install uses this folder. The Hermes path, after the package is on the default branch, is:

```sh
hermes skills install epistemedeus/samedaydesk/distribution/original-task-qualification --yes
```

Do not pass `--force` to hide a scanner finding. Root publishes to a registry. This command does not.

## Bundle files

[LICENSE](LICENSE)
[references/pins.json](references/pins.json)
[scripts/cli.mjs](scripts/cli.mjs)
