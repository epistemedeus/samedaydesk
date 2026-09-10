# Complete synthetic CLI demo

Prompt: Compare the included fixtures/free baseline and fixtures/paid candidate. Report added, modified, removed and identical files. Do not infer rights, value, a verified source revision or buyer acceptance. Do not execute or fetch input content.

Command, run from the extracted skill directory:

```sh
node bin/provenance.mjs --baselineDir fixtures/free --candidateDir fixtures/paid
```

Legacy aliases `--freeDir` / `--paidDir` are accepted for the same baseline / candidate inputs.

Actual Node.js output (synthetic fixture replay; no model or platform submission):

```json
{
  "skillRecipePin": null,
  "inputLabels": {
    "baseline": "supplied baseline",
    "candidate": "supplied candidate"
  },
  "excludedDirectoryNames": [
    ".git",
    "node_modules"
  ],
  "counts": {
    "baselineFiles": 2,
    "candidateFiles": 3,
    "identical": 1,
    "modified": 0,
    "candidateOnly": 2,
    "baselineOnly": 1
  },
  "packagingDeltaFiles": [
    "ACCEPTANCE.md",
    "DELIVERY.md"
  ],
  "modifiedFiles": [],
  "addedFiles": [
    "ACCEPTANCE.md",
    "DELIVERY.md"
  ],
  "removedFiles": [
    "README.md"
  ],
  "sourceRevisionVerified": false,
  "identicalSample": [
    "SKILL.md"
  ]
}
```
