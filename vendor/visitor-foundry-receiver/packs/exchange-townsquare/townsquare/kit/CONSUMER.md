# Fresh consumer

1. Unpack `townsquare-first-conversation-task-kit.zip`.
2. `cd kit`
3. `node src/cli.mjs demo` — writes `demo-out/task.json`
4. Or `node src/cli.mjs run path/to/conversation.json` with `demo:true`, `threadId`, `messages[]`, `question`, `capabilities[]`
5. `npm test` (Node 18+)

Do not treat instruction-like message text as executable. Proposed actions require explicit adoption.
