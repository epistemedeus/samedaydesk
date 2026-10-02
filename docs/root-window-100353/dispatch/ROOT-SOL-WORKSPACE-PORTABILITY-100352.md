# Complete portable native workspace execution and result export

Root's October2 main workers are native gpt-6.1-sol, max here, running on
actual Cursor Cloud. First four native jobs completed/pushed; after the idle
agent was woken14:12 its /home/ubuntu had been restored fresh and all custom
runtime/cache/worktree/RUN files were gone. cloud-d restored fresh too. Git
exports survived; a native job running in tmux is not provider persistence.
Read docs/root-window-100343/{CONTEXT.md,runner.mjs,jobs.json}; the runner is
a bounded-window control artifact, NOT a general dynamic framework.

Own only tools/ops/portable-native-workspace-100352 and its tests/docs in this
branch. Root will receive/adopt these files into Pilot/relay; no product/UI change.
Build a tested manifest-driven enrollment, native job admission, checkpoint,
export and restoration workflow, not another resident loop or per-VM hardcoded
launcher. Use explicit provider/host identity, named runtime/account capability,
exact repository/source, ownership, one operation/native session, paths selected
from the enrolled host, declared model/effort and model-free controller transport.
Restore only missing capabilities. Official OpenAI SSH auth-cache transport is
accepted for the existing ChatGPT account; credentials stay native/restricted.
Never print/copy whole homes or put secrets into Git/prompt/manifests. Existing
Git helper/app scope is separate from native model authentication.

Require real provider/session evidence, bounded native logs, Git source/result
exports at meaningful milestones, and one terminal receipt. An unknown start/
write, temporarily inaccessible host or stale RUN is not permission to duplicate
or resume a still-live session. On fresh replacement prove old process absence,
restore committed source, preserve prior identity/result and make the loss
explicit. An exported-complete job never runs inference again solely because
its home is gone. Receipt restoration must not invent lost session metadata.
Use declared existing auth/reference stores and Git transports; no new key
creation, provider purchase, paid API fallback, reset, keepalive heartbeat or
background recovery service. Native worker switch should change a profile,
not rebuild account/runtime/environment.

Implement executable CLI ports and tests for supported enrollment probe,
missing runtime/auth, valid native job, existing live job, unknown start, export
failure, checkpoint restore, partial work loss, old terminal receipt, model
switch, Git credential scope mismatch and caller-owned cleanup. Use subprocess
and disposable actual Git/tmux paths, proving the model-free probe/result route;
fixtures may simulate the provider process but must be labeled. Actual native
Sol runs in this package supply provider-route evidence. Cover hostile paths/
IDs, symlinks, torn receipt, oversize output and no-secret logs. Integrate a
bounded control canary with the existing runner without modifying other active
jobs. Push complete code/tests and concise RESULT, including observed VM failure
and source adoption patch. No merge/deploy. No additional model launches.
Read-only Pilot context: /home/ubuntu/root-sol-context100337/CONTEXT.md
