# Root-owned integration, release and readback

These commands are a handoff, not executed provider actions. Tested product
commit is `46a217f9665d004dd28a3b9000e36d6e72c83bcf`, tree
`dc035f6f70d8a0294fea2c4e4c149325d22fff70`, directly on installed
`d310f4cf37fb190d850ac0cea71ec34787972162` /
`8b79c1d8586c630f90a5241f52ce969fda641466`. Preserve the admitted branch
`codex/root6908-gateway-availability-20261024` and canonical origin
`https://github.com/epistemedeus/samedaydesk.git`. Diverged main is not an input.
The full export's final evidence-only HEAD/tree is in task-root
`WORKER-EXPORT.json`, written after committing this record.

On Root's owning installed-source checkout, receive the exact patch:

```sh
test "$(git remote get-url origin)" = https://github.com/epistemedeus/samedaydesk.git
test "$(git rev-parse HEAD^{tree})" = 8b79c1d8586c630f90a5241f52ce969fda641466
git cherry-pick 46a217f9665d004dd28a3b9000e36d6e72c83bcf
```

If the installed source has moved, receive that scoped composition first; neither
a full-main merge nor replay of this old observation establishes compatibility.
The checked-in config already consumed the receipt. Do not call `--receive` with
the same timestamp again. Build using the existing installed locked toolchain
and Root's actual frontend values; `npm --prefix client run build` is the tested
normal build entry. The full provider recipe remains `build:managed-contributor`,
whose private source/pins/activation Root separately receives. No lock/toolchain,
MCP-outcome family, environment, DB or merchant change is required by this patch.

Use the existing managed controller (retained installed authority `7c798f18`),
not a new deployment route. Its command interface is independently read at frozen
Pilot `0a5ebf5c93c32927a64fe4146c6848e1bf48c3c7` in
`tools/ops/hostinger-managed-release.mjs`. Root must prepare its new private
manifest with the exact integrated commit/branch, current provider preimage,
current predecessor journal and existing complete accepted environment packets.
`ROOT6908_RELEASE_MANIFEST` below names that Root-owned private file; this worker
has not created it or accessed its credentials. With Root's existing enrolled
controller environment, the finite sequence is:

```sh
node tools/ops/hostinger-managed-release.mjs "$ROOT6908_RELEASE_MANIFEST" validate
node tools/ops/hostinger-managed-release.mjs "$ROOT6908_RELEASE_MANIFEST" prepare
node tools/ops/hostinger-managed-release.mjs "$ROOT6908_RELEASE_MANIFEST" install
node tools/ops/hostinger-managed-release.mjs "$ROOT6908_RELEASE_MANIFEST" start
node tools/ops/hostinger-managed-release.mjs "$ROOT6908_RELEASE_MANIFEST" read
node tools/ops/hostinger-managed-release.mjs "$ROOT6908_RELEASE_MANIFEST" restore-linkage
```

Read the actual terminal provider build/commit and complete Root's normal private
qualification/source succession/activation/entry receiving. Preserve unknown
provider outcomes: never repeat `start` to escape a missing response. An unchanged
full environment packet is preservation, not permission to alter individual keys.
Current dependency evidence must still support the state; a changed merchant
requires new genuine receiving, never an edited observation clock.

After Root's release, from the evidence checkout, receive only the six apex
machine routes using the included raw-body recorder:

```sh
NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 OMP_NUM_THREADS=1 \
  node docs/receiving/root6908-gateway-availability/hosted-readback.mjs \
  https://samedaydesk.com "$ROOT6908_HOSTED_READBACK_DIRECTORY"
```

The output directory must be new. This verifies state/callable/observation,
summary, next action, guide bytes, dynamic skill and catalog; it sends no paid
request or merchant probe. It deliberately reports provider/source identity and
hosted human preservation as unreceived. Root must independently compare its
full actual hosted human HTML/assets preimage and postimage byte-for-byte and
receive installed source/build lineage. Local source/config/build success is
not hosted restoration, independent customer use or revenue.

For a source rollback on the integrated release branch:

```sh
git revert --no-edit 46a217f9665d004dd28a3b9000e36d6e72c83bcf
NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 OMP_NUM_THREADS=1 RAYON_NUM_THREADS=1 \
  npm --prefix client run build
```

Use a new manifest/operation for that exact rollback commit and the same finite
controller sequence. Reversion returns to the predecessor's conservative pause;
it is artifact rollback, not a new merchant observation. Do not feed old evidence
through `--receive`, restore old financial stores, change retention, recreate the
expired authorization or replay a payment. This patch has no schema/data rollback.
Root receives compatible private-source pins, unchanged human output and actual
hosted rollback separately. A later restoration still requires fresh full evidence.
