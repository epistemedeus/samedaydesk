function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(v, asset) {
  if (v == null || v === "") return "unknown";
  return `${esc(v)} ${esc(asset || "")}`.trim();
}

export function renderHtml(report) {
  const selected = report.selected || {};
  const ranked = report.ranked || [];
  const excluded = report.excludedSample || [];
  const adapters = report.adapters || [];
  const events = (report.events || []).slice(0, 40);

  const selectedBlock = selected.match
    ? `<section class="panel select">
        <h2>Selected claimable task</h2>
        <p class="title">${esc(selected.title)}</p>
        <p><a href="${esc(selected.sourceUrl)}">${esc(selected.sourceUrl)}</a></p>
        <p>adapter <code>${esc(selected.adapter)}</code> nativeId <code>${esc(selected.nativeId)}</code></p>
        <p>expected useful net return <strong>${esc(selected.expectedUsefulNetReturn)}</strong>
           uncertainty <strong>${esc(selected.uncertainty)}</strong></p>
        <h3>Prerequisites</h3>
        <ul>${(selected.prerequisites || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        <h3>Why this rank</h3>
        <ul>${(selected.why || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        <p class="note">claimAuthority=none. This page never claims or pays.</p>
      </section>`
    : `<section class="panel select none">
        <h2>No genuinely claimable paid job</h2>
        <p>${esc(selected.reason || "no_match")}</p>
        <p>${esc(selected.hint || "")}</p>
      </section>`;

  const rankRows = ranked
    .map(
      (r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.title)}</td>
        <td>${esc(r.adapter)}</td>
        <td>${money(r.reward?.amount, r.reward?.asset)}</td>
        <td>${esc(r.funding)}</td>
        <td>${esc(r.claimability)}</td>
        <td>${esc(r.expectedUsefulNetReturn)}</td>
        <td>${esc(r.uncertainty)}</td>
      </tr>`,
    )
    .join("");

  const exclRows = excluded
    .map(
      (r) => `<tr>
        <td>${esc(r.title)}</td>
        <td>${esc(r.adapter)}</td>
        <td>${esc((r.exclusionReasons || []).join(", "))}</td>
      </tr>`,
    )
    .join("");

  const adapterRows = adapters
    .map(
      (a) => `<tr>
        <td>${esc(a.adapter)}</td>
        <td>${esc(a.fetchMeta?.mode)}</td>
        <td>${esc(a.fetchMeta?.httpStatus)}</td>
        <td>${esc(a.recordCount)}</td>
        <td>${esc(a.error || "")}</td>
      </tr>`,
    )
    .join("");

  const eventRows = events
    .map(
      (e) => `<tr>
        <td>${esc(e.type)}</td>
        <td>${esc(e.at)}</td>
        <td><code>${esc(e.taskId)}</code></td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Bounty intelligence comparison</title>
  <style>
    :root { --bg:#0f1419; --card:#1a222c; --ink:#e8eef4; --muted:#9aa8b5; --accent:#7dd3c7; --warn:#e7b549; --bad:#d97070; --ok:#7bc47f; }
    * { box-sizing: border-box; }
    body { margin:0; font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    header, main { max-width: 1100px; margin:0 auto; padding: 1.25rem; }
    header h1 { font-size: 1.25rem; margin:0 0 .35rem; }
    .sub { color:var(--muted); }
    .panel { background:var(--card); border-radius:12px; padding:1rem 1.1rem; margin:1rem 0; }
    .select.none { border:1px solid var(--warn); }
    table { width:100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align:left; padding:.4rem .35rem; border-bottom:1px solid #2a3440; vertical-align:top; }
    th { color:var(--muted); font-weight:600; }
    code { font-size: 12px; }
    a { color:var(--accent); }
    .note { color:var(--muted); font-size:13px; }
    ul { margin:.3rem 0 .3rem 1.1rem; }
    .title { font-weight:650; }
    footer { color:var(--muted); font-size:12px; padding: 0 1.25rem 2rem; max-width:1100px; margin:0 auto; }
  </style>
</head>
<body>
  <header>
    <h1>Bounty intelligence</h1>
    <p class="sub">Contributor-first comparison. Not a marketplace. Generated ${esc(report.generatedAt)}.
      Rank is expected useful net return and uncertainty — not popularity.</p>
  </header>
  <main>
    ${selectedBlock}
    <section class="panel">
      <h2>Ranked available paid jobs</h2>
      <table>
        <thead><tr><th>#</th><th>title</th><th>source</th><th>reward</th><th>funding</th><th>claim</th><th>net</th><th>unc</th></tr></thead>
        <tbody>${rankRows || `<tr><td colspan="8">none</td></tr>`}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Excluded (not available paid jobs)</h2>
      <table>
        <thead><tr><th>title</th><th>source</th><th>reasons</th></tr></thead>
        <tbody>${exclRows || `<tr><td colspan="3">none in sample</td></tr>`}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Sources</h2>
      <table>
        <thead><tr><th>adapter</th><th>mode</th><th>http</th><th>n</th><th>error</th></tr></thead>
        <tbody>${adapterRows}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Lifecycle events (compact)</h2>
      <p class="note">discovery → claim → submit → accept → pay → repeat. Later stages only if labelled experience log.</p>
      <table>
        <thead><tr><th>type</th><th>at</th><th>taskId</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Disclaimers</h2>
      <ul>${(report.disclaimers || []).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
    </section>
  </main>
  <footer>Reusable page component. Not a site homepage and not global nav. Pack S277.</footer>
  <script id="bounty-intelligence-report" type="application/json">${JSON.stringify(report).replace(/</g, "\\u003c")}</script>
</body>
</html>`;
}

export function pageComponent(report) {
  return renderHtml(report);
}
