# Offline Package Provenance Check

A free, original filesystem comparison skill and CLI. It reports added, modified, removed and identical files; it does not prove source revisions, rights, value, acceptance or payment. No upstream recipes are bundled. Inputs remain data, not executable instructions.

Requires Node.js 18+; Python 3 only to build the ZIP. No npm installation, credentials or network calls are needed for these commands. From this package directory:

```sh
npm test
npm run validate
node bin/provenance.mjs --freeDir fixtures/free --paidDir fixtures/paid
npm run build:zip
```

The builder requires a fresh output path. For another build, use `python3 bin/build-skill-zip.py --out /tmp/another-skill.zip` with a nonexistent destination. It emits one top-level skill folder containing SKILL.md, source, tests, fixtures, license and demo. Extract to a fresh directory, enter `offline-package-provenance`, and repeat the commands above. The archive can rebuild itself. See DEMO.md for a complete actual CLI prompt/output replay using synthetic inputs. This is deterministic script execution, not evidence of a native model consumer.

First free activation is an operator UI action, not a CLI API: use the existing creator session at https://www.agensi.io/dashboard/submit, choose **Free**, name **Offline Package Provenance Check**, upload `dist/offline-package-provenance.zip`, and supply DEMO.md's full prompt and output. The observed form accepts a name up to 60 characters and a ZIP up to 50 MB containing SKILL.md. Review is stated as 24–48 hours, not a guarantee. These tools have not submitted or published it. **Free does not require payout setup.** Paid listings have separate minimum-price, fee and payout eligibility requirements; this candidate is free.

`private: true` prevents accidental npm publication; it does not prevent ZIP distribution. `npm run validate` checks this package's local descriptor schema and consistency, not an official Agensi validator or review outcome. The descriptor's upstream pins are references only, not runtime dependencies.

CLI input bounds: each tree at most 2,000 entries and 20 MiB; symlinks and special files rejected; .git and node_modules excluded. Missing directories fail. Empty trees are insufficient evidence. File hashes compare read bytes, not immutable Git tree identity. See PROVENANCE.md. Offline use costs $0; no MCP paid unlock, model call, account or payout action occurs.
