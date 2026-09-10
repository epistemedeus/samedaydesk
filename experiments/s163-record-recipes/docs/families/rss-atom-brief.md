# RSS/Atom brief family

Family id `rss-atom-brief`. Parser `s134-rss-atom-brief` at pin `65ce1867f1b4339cc708bfb72a7d9a5942785632` (`../s134-record-jobs/modules/rss-atom-brief/cli.mjs`). Input prep lives in `adapters/rss-atom.mjs`.

This family diffs **two already-captured** RSS or Atom XML files. It briefs item add/remove, title/link/updated/description/content corrections, and duplicate-identity counts. It does not fetch feeds, poll on a timer, push alerts, or run a subscription backend.

Cash **$0**. `paidValueClaim` is always `false`. Observed **no-change** on a live pair is a valid outcome. Synthetic pairs stay labeled.

## Recipes

| Recipe | Role | Inputs | Expected |
|---|---|---|---|
| `R-FEED-LIVE-NOCHANGE` | Live Electron `releases.atom` double-capture | `sources/feeds/electron-releases/capture-{a,b}.xml` | `comparisonStatus=comparable`, `corrected=[]`, identical SHA-256 |
| `R-FEED-SYNTH-CORR-DEDUP` | Labeled Node Atom correction + dedup | `sources/feeds/nodejs-releases/synthetic-correction-dedup-{before,after}.xml` | `corrected>=1`, `duplicates-after` uncertainty, `synthetic=true` |

Registry: `registry/recipes.json` → family `rss-atom-brief`. Demo: `node demos/rss-atom-brief.mjs` (or `npm run demo:rss`). Tests: `test/recipes.test.mjs` (`rss live no-change and synthetic correction`).

Do not copy parser source into this experiment. Spawn the pinned S134 CLI.

## Live Electron `releases.atom` double-capture (observed no-change)

Primary real source is GitHub’s public Electron Atom feed:

- URL: `https://github.com/electron/electron/releases.atom`
- Meta: `sources/feeds/electron-releases/SOURCE.json` (`synthetic: false`, `contentIdentical: true`)
- Recipe: `recipes/rss-atom-brief/R-FEED-LIVE-NOCHANGE.json`
- Fixture: `fixtures/expected/rss-electron-nochange.json`

`capture-a.xml` and `capture-b.xml` are two retrievals of the same URL. Both files are 86881 bytes with SHA-256 `40eaa75d3f53cc7d464a8f62101ede26933f18c3168afe09e3d44041a261012c`. Identical digests mean the pair is a **live no-change**, not a missed edit.

The adapter labels the pair live:

```js
import { prepareFeedCapture, buildFeedCliArgs } from '../../adapters/rss-atom.mjs';

prepareFeedCapture('sources/feeds/electron-releases/capture-a.xml');
// { ok: true, synthetic: false, bytes: 86881, paidValueClaim: false }

buildFeedCliArgs({
  before: 'sources/feeds/electron-releases/capture-a.xml',
  after: 'sources/feeds/electron-releases/capture-b.xml',
  s134Root: '../s134-record-jobs',
  allowSynthetic: false,
}).note;
// 'live or captured primary pair'
```

Literal CLI (from `experiments/s163-record-recipes`):

```bash
node ../s134-record-jobs/modules/rss-atom-brief/cli.mjs \
  --before sources/feeds/electron-releases/capture-a.xml \
  --after sources/feeds/electron-releases/capture-b.xml
```

Pinned parser output on this pair: `beforeKind=atom`, `afterKind=atom`, `comparisonStatus=comparable`, `corrected=[]`, `unchangedCount=10`, `dedupBrief.beforeDuplicateKeys=0` / `afterDuplicateKeys=0`. The report’s `differenceInDeliveredOutput` is “No correction/dedup signal on comparable feed snapshots. Still not a monitoring product.”

That empty correction list is the recorded result. Do not treat live no-change as a reason to swap in a synthetic pair without the SYNTHETIC label.

The Node live captures under `sources/feeds/nodejs-releases/capture-{a,b}.xml` are the same class of observation (`contentIdentical: true` in that `SOURCE.json`). They are **not** the correction/dedup recipe.

## SYNTHETIC Node correction/dedup pair must stay labeled

Live Node `releases.atom` is also a no-change pair. Correction and duplicate-identity behavior are demonstrated on a **derived, labeled** pair — never presented as a live-feed observation.

| Surface | How the pair stays labeled |
|---|---|
| Filenames | `synthetic-correction-dedup-before.xml`, `synthetic-correction-dedup-after.xml` |
| Meta | `sources/feeds/nodejs-releases/SYNTHETIC.json` (`synthetic: true`, derived from Node `capture-a`) |
| Recipe | `R-FEED-SYNTH-CORR-DEDUP` → `primarySource.synthetic: true` |
| Adapter | `prepareFeedCapture` sets `synthetic` when the basename matches `/synthetic/i` |
| CLI note | `buildFeedCliArgs` → `'SYNTHETIC labeled pair — not a live-feed observation'` |
| Demo | `demos/rss-atom-brief.mjs` prints `label: 'SYNTHETIC — not a live-feed observation'` |

Recipe: `recipes/rss-atom-brief/R-FEED-SYNTH-CORR-DEDUP.json`. Fixture: `fixtures/expected/rss-synthetic-correction-dedup.json`. Purpose in `SYNTHETIC.json`: “Demonstrate correction + dedup when live feed shows no-change.”

```bash
node ../s134-record-jobs/modules/rss-atom-brief/cli.mjs \
  --before sources/feeds/nodejs-releases/synthetic-correction-dedup-before.xml \
  --after sources/feeds/nodejs-releases/synthetic-correction-dedup-after.xml
```

What the labeled pair actually shows (not a live Node observation):

- **Title correction** on identity `tag:github.com,2008:Repository/27193779/v24.21.0`: after title is `SYNTHETIC corrected title for recipe demo` (`corrected.length === 1`).
- **Duplicate identity** on `tag:github.com,2008:Repository/27193779/v26.8.2` in after (`dedupBrief.afterRawCount=11`, `afterUniqueKeys=10`, `afterDuplicateKeys=1`). Uncertainty code `duplicates-after`; differing candidates stay ambiguous. No silent last-write-wins (S147 F4).

Callers that must not ingest synthetic captures pass `allowSynthetic: false`. The adapter then refuses with `synthetic-not-allowed` and does not spawn the parser.

Do not drop the SYNTHETIC filename prefix, `SYNTHETIC.json`, recipe `synthetic: true` flag, or adapter/demo labels. A correction count from this pair is a fixture signal, not evidence that the public Node feed changed.

## HTML non-feed must be refused by the adapter

`prepareFeedCapture` reads the file and **refuses** before the S134 CLI runs when the bytes look like HTML (`isProbablyHtml` in `adapters/refuse-unsupported.mjs`: leading `<!doctype`, `<html`, or a `<`…`<body` prefix).

| Condition | `code` | What happens |
|---|---|---|
| HTML document | `non-feed-html` | Refuse. Message: “HTML is not a comparable feed snapshot (S147 F6)” |
| Empty file | `empty-feed-capture` | Refuse. Not a zero-item feed. |
| Missing path | `missing-feed-capture` | Refuse. |
| Basename matches `/synthetic/i` and `allowSynthetic: false` | `synthetic-not-allowed` | Refuse. |

Example (reuse the pricing family’s HTML blob; any `<html>…<body>…` page is the same class):

```js
import { prepareFeedCapture } from '../../adapters/rss-atom.mjs';

prepareFeedCapture('sources/pricing/public-model-rows/unsupported-page.html');
// {
//   ok: false,
//   refused: true,
//   code: 'non-feed-html',
//   message: 'HTML is not a comparable feed snapshot (S147 F6)',
//   paidValueClaim: false
// }
```

S147 F6: empty or non-feed snapshots are **indeterminate** and authorize **zero** definitive removals. The S163 adapter is stricter than “let the parser guess”: HTML never becomes a comparable feed, and the prep layer does not invent `<item>` / `<entry>` rows to satisfy the CLI.

If HTML were passed straight to `s134-rss-atom-brief` (S134 fixture class `unknown`), the parser reports `kind=unknown`, `comparisonStatus=indeterminate`, and `incomparable-feed-snapshot` — still no add/remove/correct counts. Recipes in this family must not take that path; they stop at `non-feed-html`.

## No alert spam / no subscription backend

This family is an offline brief over files on disk. It is not a monitoring product.

`registry/recipes.json` `nonGoals` for the library include timers/cron backends, subscriptions, paid network calls in demos, accounts, and outbound messages. README cash boundary: no timers, subscriptions, paid calls, accounts, outbound messages, site deploy, or marketplace publish.

Consequences for operators:

- Demos and tests spawn `s134-rss-atom-brief` on local `--before` / `--after` paths only. They do not HTTP-get `releases.atom` at runtime.
- The parser’s own `differenceInDeliveredOutput` states it does not poll feeds, push alerts, or assert content authenticity. On a no-change pair it still says it is not a monitoring product.
- Free baseline (emitted on every CLI JSON): maintained offline parsers (`fast-xml-parser` here). No URL fetch, no LLM, no notifications, no marketplace listing.
- Adapter retain fields are `sourceUrl`, `license`, `format`, `synthetic` — provenance for the next operator, not a subscription record.
- No cron, webhook, email, Slack, SMS, or inbox watcher belongs in this family. A correction row is not an alert.

## Non-claims

- No feed-authenticity, completeness, or “this is the current public feed” proof. Captures are local files with SHA-256 in `SOURCE.json`.
- No RSS/Atom standards-engine claim. Coverage is title/link/updated plus bounded description/content text (`report.coverage.comparedFields`).
- No paid monitoring value, no demand/ROI, no alert-delivery SLA.
- Synthetic correction/dedup counts are not live Node (or Electron) observations.
- HTML pages are not feeds; refusing them is not a parse of the page.
- Cell ids for this library are `S163-N##`. Do not use Bot Record `native05..08`.
