# CW43 independent audit, 2026-09-12

Source: `epistemedeus/samedaydesk@3f94c052dcfe391aa15e3980c7a3a4a8ebcc7fe8`
(Sol CW15 PR123). Candidate is the commit containing this receipt on
`codex/cw43-lockfile-final-20260912`. All changes are inside
`tools/lockfile-pin-delta/`.

The npm 10.9.8 oracle generated both lockfile v2 and v3 and actually installed
local packages. Identical artifact terms moved from production to dev or peer
selection disappeared under `npm ci --omit=dev --omit=peer --omit=optional`,
while the original tool reported no change. Both selection flags now participate
in pin equality, hashes, JSON and Markdown. The legacy fallback uses the same
validated pin constructor as the packages map.

Further reproduced defects fixed:

- Git annotations previously accepted HTTP tarballs with `.git` pathnames or
  `github:` query text, and missed `git://` sources without a `.git` suffix.
  Actual npm HTTP installs and npm's installed `npm-package-arg` confirmed
  the distinction. Literal URL bytes remain unchanged; 64-hex Git IDs remain
  complete. No Git SHA-256 repository clone was executed.
- Invalid UTF-8 byte sequences could decode to the same replacement character
  and erase a source difference. CLI decoding is now fatal on invalid UTF-8.
- Arrays bypassed the structural member budget; platform terms bypassed the
  individual term cap; legacy dependency prefixes could amplify tiny input
  into large aggregate IDs. All now have explicit refusal bounds.
- Malformed package entries and nested legacy maps were silently discarded.
  They now refuse instead of producing an incomplete success.
- FIFO inputs blocked during open before regular-file validation. Nonblocking
  open now permits prompt refusal.
- Report files could overwrite source inputs in the output directory,
  including symlink and hardlink aliases. These collisions now refuse.

Validation on Node 22.23.2, Node heap 768 MB, test concurrency 1:

```sh
LOCKFILE_TEST_PORT=55550 NODE_OPTIONS=--max-old-space-size=768 \
  npm test --prefix tools/lockfile-pin-delta
# 72 tests passed; includes the existing 120 structural mutation cases

LOCKFILE_TEST_PORT=55550 NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 experiments/wave5/m01/test/invoke-lockfile.test.mjs
# 7 integration tests passed
```

The original source passed its 41 existing tool tests. Running the 31 new tests
against isolated copies of the original source produced 22 failures and 9
passes. These are regression controls, not 22 distinct defects. All 31 pass on
the candidate. The old 120-case structural cross-check mirrors normalization
and is not counted as independent npm evidence.

Independent npm evidence includes 12 generated omit-selection installs, four
workspace installs with realpath and target manifest readback, four optional
OS-selection installs, and eight HTTP tarball installs. Eight committed
v2/v3 fixture locks have a separate npm install receipt and regeneration script
in `fixtures/generated/npm-install-plans/`. HTTP stayed on loopback port 55550;
an initial bind failed due to an unrelated outgoing connection in TIME-WAIT,
then passed after it expired. All diagnostic/test subprocesses and servers
exited. No other process was terminated.

Limits: 16 MiB raw UTF-8 input per file; depth 128; 100,000 object members and
100,000 total array elements per file; 50,000 pins; 16,384 characters per pin
term (including each platform value); 4,096 characters per expanded pin ID and
16,777,216 aggregate ID characters. pnpm and Yarn refusal remains explicit.

Integration owner: native vendor integration owner / primary Root. Consume
this candidate in the engine pin and rerun the native vendor acceptance suite.
`dev` and `peer` are additive output/change-kind fields. Canonical annotation
hashes include them and therefore differ from prior tool versions even for an
otherwise identical pin. Workspace target changes remain separate target-ID
rows; unaltered link stubs remain omitted. Missing local archive integrity
continues to label workspace reports partial.

Not executed: full application/native vendor suite, Windows runtime, real
non-Linux host or libc installation, live registry installs, deployment,
production database, payments, signing or merge. Unknown: complete npm graph,
lifecycle and arbitrary install-mode equivalence. This engine remains a bounded
pin inventory rather than a complete install simulator.

Primary reference: [npm v10 package-lock documentation](https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json/).
Execution evidence above is stronger than documentation-only inference.
