# Feature map

| Goal | Surface | Command | Expected |
|---|---|---|---|
| Owner cancels own long job | Official cancelTask + child SIGTERM | journey | TASK_STATE_CANCELED and child exit SIGTERM |
| Wrong / minted local UUID | cancelTask / sendMessage taskId | journey | TASK_NOT_FOUND, original child still running |
| Foreign bearer | cancelTask | journey | TASK_NOT_FOUND under owner-scoped InMemoryTaskStore |
| Replay | second cancelTask | journey | idempotent CANCELED, child stays dead |
| Race with completion | short job then cancel | journey | TASK_NOT_CANCELABLE |
| Direct current read | getTask vs stream | journey | measured polls/ms, no savings claim |
| SDK default unauthenticated | UserBuilder.noAuthentication | journey | foreign token can cancel (shared `unknown` owner) |
