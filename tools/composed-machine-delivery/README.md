# Composed machine delivery

One cold-acquirable path across the existing task-repeat, recurring-decision, workflow-owned, and two-sided consumers.

An agent can retain one permitted capture, derive several decisions from it, select a fitting existing workflow extension, and, when a useful change asks for it, prepare bounded requester, work, delivery, and substantive acceptance. The original task, terms, rights, fee, and readback sources stay in those packages. This directory does not replace their commands.

Sharing is optional. Public output hides reward amounts. Human publication is reserved and is not performed.

## Acquire, update, and remove

Use Linux with Node 22, GNU tar, curl, and sha256sum. Take the 40-character
commit from the GitHub permalink for the candidate you intend to install.
The archive and its SHA-256 file must come from that same commit. The
checksum verifies the downloaded bytes against that revision.

```bash
export REF='<40-character GitHub commit containing the candidate>'
export DELIVERY_HOME="$PWD/composed-delivery"

(
  set -eu
  case "$REF" in ''|*[!0-9a-f]*) exit 2 ;; esac
  [ "${#REF}" -eq 40 ]
  mkdir -p "$DELIVERY_HOME/installs" "$DELIVERY_HOME/data"
  prefix="$DELIVERY_HOME/installs/$REF"
  [ ! -e "$prefix" ] && [ ! -L "$prefix" ]
  stage=$(mktemp -d "$DELIVERY_HOME/installs/.download.XXXXXX")
  trap 'rm -rf -- "$stage"' EXIT
  cd "$stage"
  base="https://raw.githubusercontent.com/epistemedeus/samedaydesk/$REF/tools/composed-machine-delivery/dist"
  archive=composed-machine-delivery.tar.gz
  curl -q --fail --silent --show-error --location --output "$archive" "$base/$archive"
  curl -q --fail --silent --show-error --location --output "$archive.sha256" "$base/$archive.sha256"
  read -r checksum filename < "$archive.sha256"
  [ "$filename" = "$archive" ]
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict
  mkdir tree
  tar -xzf "$archive" -C tree
  node tree/tools/composed-machine-delivery/cli.mjs --help
  mv -T --no-clobber -- tree "$prefix"
  [ ! -e tree ]
)
```

The local delivery commands use Node builtins. If you want to run the
official Model Context Protocol (MCP) standard-input/output client checks,
install only their locked dependency closure inside the selected installation.

```bash
cd "$DELIVERY_HOME/installs/$REF"
npm ci --ignore-scripts --omit=dev --no-audit --no-fund --prefix tools/workflow-owned-extensions
node --test tools/workflow-owned-extensions/test/sdk-stdio-client.test.mjs
```

Run a first delivery with the included synthetic page input, then inspect or
replay the result. Keep input, caller stores, and outputs outside the install.

```bash
cd "$DELIVERY_HOME/installs/$REF"
data="$DELIVERY_HOME/data"
node tools/composed-machine-delivery/cli.mjs deliver \
  --request tools/composed-machine-delivery/examples/changed-request.json \
  --store "$data/example-store" --out "$data/example-public.json"
node tools/composed-machine-delivery/cli.mjs show --store "$data/example-store"
```

The public output contains the title-change decision, the matching local
observation, and the acceptance outcome. The caller store also holds a
private receipt with its fee projection. To use your own permitted capture,
supply your request and a fresh store. Align the capture, schedule capture ID,
and extension input, and use a fresh store for a distinct delivery. Repeating
the same request in its original store returns the retained result. If the
current capture file is lost, use `recover --store <dir>` on its original store.

To update the archive installation, repeat acquisition with the new reviewed
commit and use its new directory. The existing installation remains available
while the checksum and smoke check run. Use the same external caller store
for compatible reads and replays. To remove an installation, leave its
directory and delete just `"$DELIVERY_HOME/installs/$REF"` after verifying
that `REF` is the installed commit you intend to remove.

The installed workflow extension has its own lifecycle. For a delivery using
the native selector, run the following from the installation directory. This
updates and removes the workflow prefix inside the caller store, where the
original delivery result is still available through `show`.

```bash
node tools/workflow-owned-extensions/cli.mjs update --consumer native \
  --store "$DELIVERY_HOME/data/example-store/extensions" --version 0.1.1 \
  --clock 2026-11-06T12:05:00.000Z
node tools/workflow-owned-extensions/cli.mjs remove --consumer native \
  --store "$DELIVERY_HOME/data/example-store/extensions" \
  --clock 2026-11-06T12:10:00.000Z
```

The archive's task-repeat coverage reports internal enrollment evidence as
unavailable. The underlying public pin and route checks, retained result
import, and direct comparison still run.

Build the allowlisted archive from a full checkout:

```bash
node tools/composed-machine-delivery/cli.mjs pack \
  --out tools/composed-machine-delivery/dist/composed-machine-delivery.tar.gz
(
  cd tools/composed-machine-delivery/dist
  sha256sum composed-machine-delivery.tar.gz > composed-machine-delivery.tar.gz.sha256
)
```

## Commands

```bash
node tools/composed-machine-delivery/cli.mjs deliver --request <request.json> --store <dir> [--out <public.json>]
node tools/composed-machine-delivery/cli.mjs retain --capture <capture.json> --store <dir> --clock <ISO-UTC> [--replace]
node tools/composed-machine-delivery/cli.mjs recover --store <dir> [--previous]
node tools/composed-machine-delivery/cli.mjs show --store <dir>
```

`deliver` keeps one capture. The same capture digest does not write a second copy. A different delivery in the same store is refused. A lost current capture restores the recovery copy. Explicit replace keeps the previous capture.

Work is prepared only when a decision is a useful change, the caller supplies work, and the original terms stay `feeBps` 500 on `new_job_gross`. The delivery heading must be the retained capture title. Acceptance uses the existing task-bundle diagnose outcome. The fee readout is compared with `vendor/hosted-wallet-market/src/fee.mjs`. This path does not invent a price, pay, sign, or settle.

## Direct commands

These remain the honest path when the composed request does not fit.

```bash
node tools/task-repeat-use/cli.mjs walk --case fitting
node tools/task-repeat-use/cli.mjs walk --case nonfitting-capture
node tools/recurring-decision-consumer/cli.mjs recur --capture <capture.json> --intents <intents.json> --priors <priors.json> --schedule <schedule.json> --clock <ISO-UTC> --horizon <hours>
node tools/result-reuse/cli.mjs preview --input <result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC>
node tools/workflow-owned-extensions/cli.mjs acquire --consumer native --site samedaydesk --store <dir> --source c60641e8ff2b94dd704307e57f5b6fe789ba0df7 --clock <ISO-UTC>
node tools/two-sided-work-consumer/cli.mjs post --journey <file> --input <post.json> --clock <ISO-UTC>
```

A permitted field snapshot is not a walletless verification result. Repeat use stays on `task-repeat-use`. Observation-only callers stay on `result-reuse`. Named workflow needs are `local-process`, `mcp-tool`, and `unpublished-review`, and only when the caller also names a site and supplies a fitting input that agrees with the retained capture. `ghost`, `dify`, `n8n`, and `dify-table-csv` stay unsupported.

## Checks

This package owns its checks. From the extracted tree:

```bash
npm test --prefix tools/composed-machine-delivery
```

The same run does not need npm:

```bash
node --test --test-concurrency=1 tools/composed-machine-delivery/test/*.test.mjs
```
