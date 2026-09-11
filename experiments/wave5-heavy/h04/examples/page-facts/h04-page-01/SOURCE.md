# SOURCE — h04-page-01

Repo: `epistemedeus/samedaydesk`  
Path: `client/public/tools/schema-validator.html`  
Public URL: `https://samedaydesk.com/tools/schema-validator.html`

| Side | Full SHA | Commit |
| --- | --- | --- |
| before | `ff381d2b46e9beec1475212df2eb610a7b01229b` | site: add exact seller repair briefs |
| after | `374a565784bcd4ec89eeda7fedbb9610fed77473` | Improve JSON-LD validator search snippet |

Facts below are copied from `git show SHA:path`. The extract-batch JSON is a caller-owned wrapper; selected `title` / `description` / `headings` match these HTML strings (HTML entities decoded).

## Before (`git show ff381d2b46e9beec1475212df2eb610a7b01229b:client/public/tools/schema-validator.html`)

```html
<title>Free JSON-LD / Schema Validator: check your structured data for AI search | SameDayDesk</title>
<meta name="description" content="Paste your JSON-LD structured data to validate it: catches JSON syntax errors, missing @context/@type, and missing recommended fields for common schema types (Organization, Product, FAQPage, Article, LocalBusiness). Free, no signup, instant." />
...
<h1>JSON-LD / Schema Validator</h1>
<p class="lead">Paste your structured data to catch the mistakes AI engines and Google silently ignore: invalid JSON, missing <code>@context</code>/<code>@type</code>, and missing required fields for common types. Free, no signup.</p>
```

Lines: title L6, description L7, h1 L51, lead L52.

## After (`git show 374a565784bcd4ec89eeda7fedbb9610fed77473:client/public/tools/schema-validator.html`)

```html
<title>Free JSON-LD Validator &amp; Schema Checker | SameDayDesk</title>
<meta name="description" content="Paste JSON-LD to check JSON syntax, @context, @type, and recommended fields for common Schema.org types. Runs in your browser. Free, no signup." />
...
<h1>Free JSON-LD Validator &amp; Schema Checker</h1>
<p class="lead">Paste JSON-LD to catch invalid JSON, missing <code>@context</code> or <code>@type</code>, and missing recommended fields for common Schema.org types. The check runs in your browser. Free, no signup.</p>
```

Lines: title L6, description L7, h1 L51, lead L52.

Decoded selected facts:

| Field | Before | After |
| --- | --- | --- |
| title | Free JSON-LD / Schema Validator: check your structured data for AI search \| SameDayDesk | Free JSON-LD Validator & Schema Checker \| SameDayDesk |
| h1 | JSON-LD / Schema Validator | Free JSON-LD Validator & Schema Checker |
| description | Paste your JSON-LD structured data to validate it: … Free, no signup, instant. | Paste JSON-LD to check JSON syntax, @context, @type, and recommended fields for common Schema.org types. Runs in your browser. Free, no signup. |

h2 CTA “Want valid structured data installed on your real pages?” is unchanged.

Not reused: W4 SAMPLE RFQ fixtures, `rfq.example` URLs, or “Q3 widget RFQ”.
