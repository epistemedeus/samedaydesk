/**
 * Parse published FAMILIES.md. Do not invent families that are not in the document.
 */
export function parseFamiliesMarkdown(markdown) {
  const families = [];
  const seen = new Set();
  for (const raw of String(markdown).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const id = cells[0];
    if (!id || id === "Family" || /^-+$/.test(id.replace(/:/g, ""))) continue;
    if (!/^[a-z][a-z0-9-]+$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    families.push({
      id,
      recipeSamples: cells[1],
      honesty: cells[2],
    });
  }
  return families;
}

export function slugTokens(value) {
  const STOP = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "not",
    "job",
    "jobs",
    "via",
    "only",
    "this",
    "that",
    "into",
    "plus",
    "json",
    "cli",
    "brief",
    "use",
    "used",
    "before",
    "after",
    "pack",
    "packet",
    "operator",
    "daemon",
    "public",
    "page",
    "change",
    "record",
    "records",
    "work",
    "valid",
    "live",
    "html",
    "refused",
    "case",
  ]);
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export function tokenHits(needles, haystack) {
  const hay = String(haystack || "").toLowerCase();
  return [...new Set(needles)].filter((t) => hay.includes(t));
}

export function adjacentCatalogIds(subjectId, subjectText, catalogJobs) {
  const idTokens = slugTokens(subjectId);
  const needles = [...new Set([...idTokens, ...slugTokens(subjectText)])];
  const adjacent = [];
  for (const job of catalogJobs) {
    const hay = `${job.id} ${job.title || ""} ${job.summary || ""}`;
    const hits = tokenHits(needles, hay);
    const idHits = hits.filter((t) => idTokens.includes(t));
    if (hits.length >= 2 && idHits.length >= 1) {
      adjacent.push({ catalogJobId: job.id, hits });
    }
  }
  return adjacent;
}

