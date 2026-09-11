# h04-lock-pub-b05-normalize primary source

Repo: `npm/cli`  
SHA: `b888cc9a9ff34a8b023ff47b784692396635397b`  
Subject: `chore: release 12.0.2`  
Path: `package-lock.json` (lockfileVersion 3, 1202 `packages` keys)

Commit: https://github.com/npm/cli/commit/b888cc9a9ff34a8b023ff47b784692396635397b  
Raw: https://raw.githubusercontent.com/npm/cli/b888cc9a9ff34a8b023ff47b784692396635397b/package-lock.json

`before.json` is a bounded extract of that blob: root + 22 integrity-bearing `node_modules/*` pins (`abbrev`, `semver`, `tar`, `glob`, …). Full 1202-key lock is ~437 KiB; the extract is the same public name+version+integrity+resolved triples.

## After transform (same pins)

`after.json` is those 22 pins plus:

- reversed `packages` key order and reversed field order inside each object
- indent 4 vs 2
- unused fields the parser ignores (`description` on `""`, `hasInstallScript`/`funding` on `node_modules/semver`)
- extra omit entry `node_modules/lockfile-public-link-omit` with `"link": true`

Quoted from the public blob (`node_modules/semver`):

```
{
  "node_modules/semver": {
    "version": "7.8.5",
    "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
    "integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA=="
  }
}
```

Packages whose name/version/integrity/resolved changed in this pair: **none**.

Stored sha256: before `7451c2e070e18b34a7d0690a87a4acd50b8f62b8800f12addb30289ba28b1425`, after `de32500dbeefe8bb5374857c4ea19c831104e506afe503ebf1d65fc5a1ae2680`.

Not copied: W4 SAMPLE fixtures, M07 corpora, or the SDS lock-03 noise file.
