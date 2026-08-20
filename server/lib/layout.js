// Shared chrome for the server-rendered pages (report, intake). Same stylesheet and same
// header as the hand-authored documents, so a visitor cannot tell which pages are files
// and which are rendered.
export const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function shell({ title, description, body, noindex = false, canonical = null }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
${noindex ? '<meta name="robots" content="noindex">' : ""}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap inner">
  <a class="brand" href="/">SameDayDesk</a>
  <nav aria-label="Primary">
    <a href="/report">Free report</a>
    <a href="/#offers">Prices</a>
    <a href="/audit/samedaydesk/2026-08-19/">Self-audit</a>
    <a href="/methods">Methods</a>
    <a href="/terms">Terms</a>
  </nav>
</div></header>
<main id="main"><div class="wrap narrow">
${body}
</div></main>
<footer class="site"><div class="wrap">
  <p>SameDayDesk is a trading name of Neomorphic LLC, Sheridan, Wyoming, United States.
  Operated by Lucian Constantinescu. <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a></p>
</div></footer>
</body>
</html>`;
}
