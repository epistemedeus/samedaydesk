# Town Square first conversation → task kit (S170)

Clean-unpack kit integrating R2-TOWNSQUARE-01..07 into one CLI that turns a **synthetic first public conversation** into a **scoped task**.

```sh
unzip townsquare-first-conversation-task-kit.zip
cd kit
node src/cli.mjs demo
node src/cli.mjs run fixtures/conversation.positive.json
npm test
```

`demo:true` only. No fabricated users. `execute:false`. Root owns merge/publish/paid.
