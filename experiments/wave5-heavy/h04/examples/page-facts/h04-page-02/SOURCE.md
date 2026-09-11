# SOURCE — h04-page-02 (meaningful-no-change control)

Repo: `epistemedeus/samedaydesk`  
Path: `client/public/resources.html`  
Public URL: `https://samedaydesk.com/resources.html`

| Side | Full SHA | Commit |
| --- | --- | --- |
| before | `ff381d2b46e9beec1475212df2eb610a7b01229b` | site: add exact seller repair briefs |
| after | `542d1748060ffadeda2491ddbbf134db31ce2890` | Add portfolio discovery foundation and truthful machine 404s |

This is the control that distinguishes a useful selected-field job from a dumb HTML diff. `git diff` is non-empty (footer sentence). Selected page facts are identical.

## Selected facts — identical on both SHAs

`git show ff381d2b46e9beec1475212df2eb610a7b01229b:client/public/resources.html` and `git show 542d1748060ffadeda2491ddbbf134db31ce2890:client/public/resources.html`:

```html
<title>Guides, Reports &amp; Free Tools for AI Search | SameDayDesk</title>
<meta name="description" content="Everything SameDayDesk publishes to help you ship safer AI-search, automation, and agent work: 15 plain-English guides, 10 original research reports, and a full set of free tools. No signup." />
...
<h1>Guides, reports &amp; free tools for AI search</h1>
```

Lines: title L6, description L7, h1 L48. h2 set is also identical: Free tools; Agent interfaces; Open-source documentation lab; Public-data product lab; Guides (15); Research reports (10); Want it done for you?

## Noise that a dumb diff would flag

Before footer (`git show ff381d2…:client/public/resources.html` L123–125):

```html
  <footer>
    <a href="/">SameDayDesk home</a> · <a href="/tools/ai-readiness">Free AI-readiness checker</a> · <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>
  </footer>
```

After footer (`git show 542d174…:client/public/resources.html` L123–126):

```html
  <footer>
    <a href="/">SameDayDesk home</a> · <a href="/tools/ai-readiness">Free AI-readiness checker</a> · <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>
    <p>SameDayDesk is the operating merchant. <a href="https://ein.llc/">EIN.LLC</a> is a separate formation product. <a href="https://neomorphic.io/">Neomorphic.io</a> is the public experiment lab.</p>
  </footer>
```

The extract-batch wrapper also changes `jobId`, provenance `fetchedAt`/`completedAt`, unused `data.text` (footer sentence appended), and unused `data.assetHash` / `data.generatedAt`. Job fields are only `title`, `description`, `headings`. Expected verdict: **unchanged**.
