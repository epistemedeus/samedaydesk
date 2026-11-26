import { badgeMessage, badgeStatusLabel } from "./badge.js";
import { DISCLAIMER } from "./scorecard.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function catalogLinks(catalog) {
  if (!catalog?.length) return "<p>No priced catalog links are currently available for this page.</p>";
  const items = catalog.map((item) => {
    const price = item.interval === "month" ? `${item.cents / 100} USD/mo` : `${item.cents / 100} USD`;
    return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a> (${escapeHtml(price)})</li>`;
  }).join("");
  return `<ul>${items}</ul>`;
}

function observationStatus(item) {
  const status = item.registryStatus || item.status || "unmarked";
  if (item.unpaid402OutputSchemaPresent === false) return `${status} · schema unmarked`;
  return status;
}

function observationList(observations) {
  if (!observations?.length) return "<p>No observations are on record.</p>";
  return `<ul>${observations.map((item) => {
    const status = observationStatus(item);
    const method = item.unpaid402OutputSchemaPresent === false && String(item.method || "").toUpperCase() === "POST"
      ? "POST (schema unmarked)"
      : (item.method || "unspecified method");
    const when = item.lastVerified || item.updatedAt || item.publishedAt || "";
    const name = item.id || item.route || item.registryName || "observation";
    const version = item.protocolVersion
      ? ` · protocolVersion ${item.protocolVersion}`
      : item.x402Version != null
        ? ` · x402Version ${item.x402Version}`
        : item.registrySchema
          ? ` · listing schema ${item.registrySchema}`
          : "";
    return `<li><code>${escapeHtml(name)}</code> · ${escapeHtml(method)} · ${escapeHtml(status)}${escapeHtml(version)}${when ? ` · ${escapeHtml(when)}` : ""}</li>`;
  }).join("")}</ul>`;
}

function versionLine(scorecard) {
  if (scorecard.kind === "mcp") {
    const observed = scorecard.observedProtocolVersion
      ? `Observed MCP protocolVersion ${scorecard.observedProtocolVersion}.`
      : "No MCP protocol version was observed.";
    const schema = scorecard.registrySchema
      ? ` Registry listing document schema is ${scorecard.registrySchema}, which is not a protocol version.`
      : "";
    return `${observed}${schema}`;
  }
  if (scorecard.observedX402Version != null) {
    const paths = (scorecard.wellKnownPaths || []).join(", ");
    return `Observed x402Version ${scorecard.observedX402Version}${paths ? ` at ${paths}` : ""}.`;
  }
  return "No x402Version was observed.";
}

export function renderIndexHtml(directory, { origin = "https://samedaydesk.com" } = {}) {
  const mcp = (directory.mcp || []).map((card) => `<li><a href="/directory/mcp/${escapeHtml(card.subjectKey)}">${escapeHtml(card.subjectKey)}</a> · ${escapeHtml(badgeStatusLabel(card))} · ${escapeHtml(card.checkedAt || "no check time")}</li>`).join("");
  const x402 = (directory.x402 || []).map((card) => `<li><a href="/directory/x402/${escapeHtml(card.subjectKey)}">${escapeHtml(card.subjectKey)}</a> · ${escapeHtml(badgeStatusLabel(card))} · ${escapeHtml(card.checkedAt || "no check time")}</li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SameDayDesk MCP and x402 directory</title>
<meta name="description" content="Public MCP and x402 check records. Not a certification.">
</head><body>
<h1>Public MCP and x402 check directory</h1>
<p>${escapeHtml(DISCLAIMER)}</p>
<h2>MCP</h2>
<ul>${mcp || "<li>No public MCP checks are on record.</li>"}</ul>
<h2>x402</h2>
<ul>${x402 || "<li>No public x402 checks are on record.</li>"}</ul>
<h2>Currently available catalog links</h2>
${catalogLinks(directory.catalog)}
</body></html>`;
}

export function renderScorecardHtml(scorecard) {
  const badge = scorecard.kind === "mcp"
    ? `/directory/mcp/${scorecard.subjectKey}/badge.svg`
    : `/directory/x402/${scorecard.subjectKey}/badge.svg`;
  const limitations = (scorecard.limitations || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(scorecard.subjectKey)} · SameDayDesk ${escapeHtml(scorecard.kind)} check</title>
<meta name="description" content="Public ${escapeHtml(scorecard.kind)} check recorded at ${escapeHtml(scorecard.checkedAt || "an unknown time")}. Not a certification.">
</head><body>
<h1>${escapeHtml(scorecard.subjectKey)}</h1>
<p>Status: <strong>${escapeHtml(badgeStatusLabel(scorecard))}</strong>. Freshness: ${escapeHtml(scorecard.freshness)}. Completeness: ${escapeHtml(scorecard.completeness)}. Checked at ${escapeHtml(scorecard.checkedAt || "an unknown time")}.</p>
<p>Methods: ${escapeHtml((scorecard.methods || []).join("; ") || "unspecified")}.</p>
<p>Scope: ${escapeHtml((scorecard.scope || []).join(", ") || "unspecified")}.</p>
<p>${escapeHtml(versionLine(scorecard))}</p>
<p><img alt="${escapeHtml(badgeMessage(scorecard))}" src="${escapeHtml(badge)}"></p>
<p>Copy-paste badge: <code>![SameDayDesk ${escapeHtml(scorecard.kind)} check](${escapeHtml(badge)})</code></p>
<h2>Observations</h2>
${observationList(scorecard.observations)}
<h2>Limitations</h2>
<ul>${limitations}</ul>
<h2>Currently available catalog links</h2>
${catalogLinks(scorecard.catalog)}
<p>${escapeHtml(DISCLAIMER)}</p>
<p><a href="/directory">All public checks</a></p>
</body></html>`;
}
