// Excerpt of client/src/data/machineEntry.mjs at ad9bc7b448cf1f635ff1488affbe206aaf981ac0
// First-byte useful-jobs shell title/description/crawlerHtml only.
// Not a live fetch. Local git show.
export const USEFUL_JOBS_PATH = "/for-agents/useful-jobs";
export const USEFUL_JOBS_TITLE = "Offline useful jobs for agent callers | SameDayDesk";
export const USEFUL_JOBS_DESCRIPTION =
  "Ten offline jobs: lockfile pin-delta first, plus JSON Schema drift, route-table diff, page-change, and the original six for API changes, budgets, feeds, and delivery evidence. Acquire with bash, curl, python3, tar, and mktemp; then run on local Node 22. Verify size and sha256 before extract. Samples are labeled SAMPLE. page-change --example is refused. Callers supply their own files. Free local package; not hosted execution.";
export const USEFUL_JOBS_CANONICAL = `${SITE_ORIGIN}${USEFUL_JOBS_PATH}`;

export const USEFUL_JOBS_CRAWLER_HTML = `
      <h1>Offline useful jobs for agent callers</h1>
      <p>
        Turn changing files into useful next steps. SameDayDesk publishes ten offline
        jobs: lockfile pin-delta first, plus JSON Schema drift, route-table diff, page-change,
        and the original six for API changes, budgets, feeds, and delivery evidence. Acquire the archive
        with <code>bash</code>, <code>curl</code>, <code>python3</code>, <code>tar</code>,
        and <code>mktemp</code>; then run on local Node 22. Labeled samples need
        <code>--example</code> except page-change, which refuses it. Callers supply their own files. Free local package; it does
        not start hosted extract on <a href="${FOR_AGENTS_CANONICAL}">/for-agents</a>. Not a paid HTTP merchant route.
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
        Acquire tools: <code>${USEFUL_JOBS_ACQUIRE_TOOLS.join(", ")}</code>.
        Runtime after extract: <code>${USEFUL_JOBS_RUNTIME}</code>.
        <a href="${SITE_ORIGIN}${USEFUL_JOBS_ARCHIVE}">Download archive</a>.
      </p>
      <h2>Install / cold start (verify before extract)</h2>
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
        Scope: free local package only. Missing inputs or digest mismatch stop the job.
        Partial vendor or listing evidence stays non-final. Evidence CI annotations from
        caller packets stay unattested. This package does not run hosted extract.
      </p>
    `;

export const USEFUL_JOBS_SHELL = Object.freeze({
  path: USEFUL_JOBS_PATH,
  title: USEFUL_JOBS_TITLE,
  description: USEFUL_JOBS_DESCRIPTION,
  canonical: USEFUL_JOBS_CANONICAL,
  crawlerHtml: USEFUL_JOBS_CRAWLER_HTML,
});

