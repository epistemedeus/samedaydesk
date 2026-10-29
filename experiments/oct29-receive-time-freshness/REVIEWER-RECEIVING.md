# Reviewer receiving after PR 344 CI

Matched production installs on exact base a5b40cb and original candidate eb18a6ed reproduced base 7/7 and candidate 5/7 proxy tests. All 548 declared members were checked. Only package.json plus the two intended managed-watch runtime files differed.

Removed the unnecessary npm alias, restoring the exact accepted package.json bytes. Updated only the declared service.mjs/source.mjs hashes and retained the full prior accepted closure. Existing caller identities still pass. Tampering with either repaired member is refused. No verifier relaxation, dependency change or new financial authority.

Use `node experiments/oct29-receive-time-freshness/accept.mjs` directly. Original native RESULT and evidence are preserved. The reviewer reran actual proxy/startup/managed-watch and delayed HTTP/Postgres/recipient recovery checks. Full command output and new installed evidence are in evidence/reviewer-receiving.json.

The actual configured Hostinger build is `build:managed-foundry`, not default build, and auto-deploy is disabled per the release owner's official read. Both exact base and amended candidate passed this managed build, including pinned deployable runtime materialization and its managed-node probe. All 351 emitted files (59949496 bytes), 139 HTML files and 294 old public assets are raw-equal. No normalization. Production source c4ec17a8 and provider configuration were not changed; Root owns release.
