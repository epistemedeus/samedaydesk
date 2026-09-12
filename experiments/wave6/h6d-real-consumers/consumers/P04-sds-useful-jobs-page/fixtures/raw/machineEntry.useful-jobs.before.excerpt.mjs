// Excerpt of client/src/data/machineEntry.mjs at abeb54eca9a71abe117898e8fe7de7e55e9d917f
// First-byte useful-jobs shell title/description/crawlerHtml only.
// Not a live fetch. Local git show.
export const USEFUL_JOBS_PATH = "/for-agents/useful-jobs";
export const USEFUL_JOBS_TITLE = "Offline useful jobs for agent callers | SameDayDesk";
export const USEFUL_JOBS_DESCRIPTION =
  "Download one Node 22 offline package with six local jobs: API upgrade brief, vendor budget impact, feed agenda, evidence CI annotation, listing repair packet, and repeat job record. Verify size and sha256 before extract. Samples are labeled SAMPLE. Callers supply their own files. No purchase or scheduler authority.";
export const USEFUL_JOBS_CANONICAL = `${SITE_ORIGIN}${USEFUL_JOBS_PATH}`;

export const USEFUL_JOBS_CRAWLER_HTML = `
      <h1>Offline useful jobs for agent callers</h1>
      <p>
        SameDayDesk publishes one Node 22 offline package with six local jobs:
        API upgrade brief, vendor budget impact, feed agenda, evidence CI annotation,
        listing repair packet, and repeat job record. Download the archive, verify
        size and sha256, then extract. Labeled samples require <code>--example</code>.
        Ordinary callers must supply their own files. The CLI has no purchase authority,
        does not start a scheduler, and does not claim kit authority for arbitrary
        schema-valid input. Free local runs stay distinct from optional paid hosted
        extract on <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>.
      </p>
      <p>
        Machine discovery:
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_DISCOVERY}">${SITE_ORIGIN}${USEFUL_JOBS_DISCOVERY}</a>.
        Catalog:
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_CATALOG}">${SITE_ORIGIN}${USEFUL_JOBS_CATALOG}</a>.
        Outcomes:
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_OUTCOMES}">${SITE_ORIGIN}${USEFUL_JOBS_OUTCOMES}</a>.
        Archive: <a href="${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}">${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}</a>
        (${USEFUL_JOBS_ARCHIVE_BYTES} bytes, sha256 <code>${USEFUL_JOBS_ARCHIVE_SHA256}</code>).
        Source <code>${USEFUL_JOBS_SOURCE_REPO}</code> at
        <code>${USEFUL_JOBS_SOURCE_COMMIT}</code>. Archive freeze
        <code>${USEFUL_JOBS_ARCHIVE_FREEZE}</code>. Reviewed source
        <code>${USEFUL_JOBS_REVIEWED_SOURCE}</code>.
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}">Download archive</a>.
      </p>
      <h2>Cold start (verify before extract)</h2>
      <pre><code>${USEFUL_JOBS_COLD_START}</code></pre>
      <h2>List and help</h2>
      <pre><code>${USEFUL_JOBS_LIST_HELP}</code></pre>
      <h2>Labeled SAMPLE examples (not caller files)</h2>
      <pre><code>${USEFUL_JOBS_EXAMPLES}</code></pre>
      <h2>Two different callers</h2>
      <pre><code>${USEFUL_JOBS_CALLER_USE}</code></pre>
      <h2>Changed-file repeat</h2>
      <pre><code>${USEFUL_JOBS_REPEAT_USE}</code></pre>
      <p>
        Material limit: missing required inputs refuse closed. Digest mismatch on
        repeat-job-record refuses. Partial vendor or listing evidence stays non-final.
        Evidence CI annotations from caller packets stay unattested. Schema-valid
        input is not kit-produced authority.
      </p>
    `;

export const USEFUL_JOBS_SHELL = Object.freeze({
  path: USEFUL_JOBS_PATH,
  title: USEFUL_JOBS_TITLE,
  description: USEFUL_JOBS_DESCRIPTION,
  canonical: USEFUL_JOBS_CANONICAL,
  crawlerHtml: USEFUL_JOBS_CRAWLER_HTML,
});

