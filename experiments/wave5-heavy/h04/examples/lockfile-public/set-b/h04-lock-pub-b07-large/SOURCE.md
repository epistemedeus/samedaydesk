# h04-lock-pub-b07-large primary source

Repo: `epistemedeus/samedaydesk`  
SHA: `218b2fa74d63951eeeda4cf0a67c420835a58b01`  
Subject: `S51: optional correspondence mount on the existing Node host.`  
Path: `package-lock.json` (lockfileVersion 3)

`git show 218b2fa74d63951eeeda4cf0a67c420835a58b01:package-lock.json` is the stored `before.json` / `after.json` (identical bytes). This is the full public lock, not a W4 SAMPLE and not the lock-03 noise subset.

| Metric | Value |
| --- | --- |
| packages keys | 162 (including `""` root) |
| engine pins (`link:true` skipped) | 160 |
| missing integrity | 1 (`vendor/neomorphic-correspondence` / `@neomorphic/correspondence@0.1.0`) |
| bytes | 72380 |

Quoted missing-integrity pin (still a packages key; not omitted here because this job is the realistic full blob):

```
    "vendor/neomorphic-correspondence": {
      "name": "@neomorphic/correspondence",
      "version": "0.1.0",
      ...
    }
```

Self-diff pin identity (name+version+integrity+resolved): added 0, removed 0, changed 0. Engine labels missing integrity `partial`.

npm/cli latest lock is 1202 packages (~437 KiB) and webpack-cli is 1570+; those exceed the 100–300 pin store cap used here. SDS 160 pins is the bounded realistic lockfileVersion 3 input.

Stored sha256: `d51849d016d28f67aae0a99eeb6b4dd810c1c0069ced4094eb127a5301ed8fac`.

Not copied: W4 fixtures, M07 corpora.
