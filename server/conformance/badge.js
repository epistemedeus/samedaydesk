import { DISCLAIMER } from "./scorecard.js";

const COLORS = {
  checked: "#3b6d9c",
  partial: "#b58100",
  stale: "#6b7280",
  failed: "#b42318",
  unknown: "#6b7280",
  incomplete: "#b58100",
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function checkedDay(checkedAt) {
  if (!checkedAt) return "no check time";
  const day = String(checkedAt).slice(0, 10);
  return day || "no check time";
}

export function badgeLabel(scorecard) {
  return scorecard.kind === "mcp" ? "SameDayDesk MCP check" : "SameDayDesk x402 check";
}

export function badgeStatusLabel(scorecard) {
  const status = scorecard.status || "unknown";
  if (status === "stale" && scorecard.completeness === "incomplete") return "stale/partial";
  if (status === "failed" && scorecard.freshness === "stale") return "failed/stale";
  if (status === "failed" && scorecard.completeness === "incomplete") return "failed/partial";
  return status;
}

export function badgeMessage(scorecard) {
  return `${badgeStatusLabel(scorecard)} · ${checkedDay(scorecard.checkedAt)} · not a certification`;
}

export function renderBadgeSvg(scorecard) {
  const label = badgeLabel(scorecard);
  const message = badgeMessage(scorecard);
  const color = COLORS[scorecard.status] || COLORS.unknown;
  const labelWidth = 150;
  const messageWidth = Math.max(210, 7 * message.length);
  const width = labelWidth + messageWidth;
  const title = [
    `${label} for ${scorecard.subjectKey || "unknown target"}`,
    `scope: ${(scorecard.scope || []).join(", ") || "unspecified"}`,
    `checkedAt: ${scorecard.checkedAt || "none"}`,
    `methods: ${(scorecard.methods || []).join("; ") || "unspecified"}`,
    `freshness: ${scorecard.freshness}; completeness: ${scorecard.completeness}`,
    DISCLAIMER,
  ].join(" — ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>
`;
}
