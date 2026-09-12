# SOURCE — h04-ap-page-noise

Repo: `epistemedeus/samedaydesk`  
Path: `client/public/skillguard.html`  
Public URL: `https://samedaydesk.com/skillguard`  
Selected fields: `title`, `description`, `headings`.

This is the **no-change control** that distinguishes a useful selected-field job from a dumb JSON/HTML diff. Public SkillGuard title, meta description, h1, and h2 list are identical from first publish through HEAD. The extract-batch **wrapper** is a labeled **synthetic mechanism perturbation**: provenance timestamps, unused `data.text` / `generatedAt` / `assetHash`, `jobId`, accounting bytes, and JSON key order. Not a live re-fetch. Not `rfq.example`. Not h04-page-02 `resources.html`.

| Side | Full SHA | Note |
| --- | --- | --- |
| selected HTML | `ff381d2b46e9beec1475212df2eb610a7b01229b` | `git show ff381d2:client/public/skillguard.html` — file is byte-identical for title/description/h1/h2 at HEAD |
| wrapper after | synthetic | key-order + unused fields + later provenance times |

## Selected facts — identical (`git show ff381d2b46e9beec1475212df2eb610a7b01229b:client/public/skillguard.html`)

```html
<title>SkillGuard: scan a Claude Code skill or MCP server for malware before you install it</title>
<meta name="description" content="A free CLI that statically scans Claude Code skills, plugins, and MCP servers for env-var exfiltration, install-time shell hooks, prompt injection, and committed malware, before you install. Never runs the scanned code. Paid deep audit + continuous watch available." />
...
<h1>Scan a Claude Code skill or MCP server for malware <em>before</em> you install it.</h1>
...
<h2>What it catches</h2>
<h2>Stop worrying about what you install</h2>
<h2>Safe by design</h2>
```

Visible h1 (emphasis tags dropped, matching how the heading reads):  
`Scan a Claude Code skill or MCP server for malware before you install it.`

Canonical in the same file: `https://samedaydesk.com/skillguard`.

## Noise that a dumb diff would flag

- `jobId` differs.
- `sources[0].provenance.requestedAt` / `completedAt` / `fetchedAt` move from 2026-08-30 to 2026-09-12.
- Unused `data.text` appends a footer attribution sentence.
- Unused `data.generatedAt` and `data.assetHash` change.
- Top-level JSON keys and `data` / `headings` object keys are reordered (canonicalize sorts keys; heading **array** order is not shuffled, so this is not `verdict=reordered`).

Job fields are only `title`, `description`, `headings`. Expected verdict: **unchanged**. `usefulNoChange`: **true**. `claims.fresh`: **false**.
