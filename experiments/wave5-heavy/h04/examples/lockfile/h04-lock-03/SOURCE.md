# h04-lock-03 primary source

Repo: `epistemedeus/samedaydesk`  
SHA: `218b2fa74d63951eeeda4cf0a67c420835a58b01`  
Subject: `S51: optional correspondence mount on the existing Node host.`  
Path: `package-lock.json` (lockfileVersion 3, 162 `packages` keys, 160 engine pins)

`git show 218b2fa74d63951eeeda4cf0a67c420835a58b01:package-lock.json` is byte-identical to `HEAD` `package-lock.json` on this worktree (`sha256:d51849d016d28f67aae0a99eeb6b4dd810c1c0069ced4094eb127a5301ed8fac`). No later commit touches that path.

## Subset (legal-to-store caller fixture)

`before.json` is that blob with one packages key removed:

```
    "vendor/neomorphic-correspondence": {
      "name": "@neomorphic/correspondence",
      "version": "0.1.0",
      "dependencies": { "express": "^5.2.1", "pg": "^8.23.0", "zod": "^3.25.76" },
      ...
    }
```

That local path has a version and no `integrity`. Engine `compare.mjs` labels any missing-integrity pin `partial` even when added/removed/changed are all 0. A full-file self-diff of 218b2fa was executed and returned `status: partial`, `changed: 0`, `missingIntegrity: 1`. It is **not** this no-change control.

Kept as-is (engine skips `link === true`):

```
    "node_modules/@neomorphic/correspondence": {
      "resolved": "vendor/neomorphic-correspondence",
      "link": true
    }
```

## After transform (same pins)

`after.json` is the same 159 integrity-bearing pins plus:

- reversed `packages` key order and reversed field order inside each package object
- indent 4 vs 2
- unused fields the parser ignores (`description` on `""`, `hasInstallScript`/`funding` on `node_modules/ms`)
- extra omit entry `node_modules/samedaydesk-link-omit` with `"link": true`

Packages whose version/integrity changed in this pair: **none**.

Engine `e81efc8ab71b1bde88eca743d297149e61bbb6f2`: status `informational`, added 0, removed 0, changed 0, unchanged 159 omitted, missingIntegrity 0.
