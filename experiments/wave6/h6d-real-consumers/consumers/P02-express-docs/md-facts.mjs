/**
 * Caller-owned markdown → selected extract-batch fields.
 * Fence-aware ATX headings. Does not import kit engines.
 * Markdown/HTML is not equivalent to samedaydesk.extract-batch.v0.
 */

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

export const SELECTED_FIELDS = Object.freeze(["title", "headings", "text"]);

export function normalizeTitleFact(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[ \t]+/g, " ").trim();
}

function fenceOpen(line) {
  const match = /^(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  return { char: match[1][0], len: match[1].length };
}

function fenceCloses(line, open) {
  const match = /^(`{3,}|~{3,})[ \t]*$/.exec(line);
  if (!match) return false;
  return match[1][0] === open.char && match[1].length >= open.len;
}

export function walkMarkdownLines(markdown, onVisibleLine) {
  const text = String(markdown ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let fence = null;
  for (const line of lines) {
    if (fence) {
      if (fenceCloses(line, fence)) fence = null;
      continue;
    }
    const open = fenceOpen(line);
    if (open) {
      fence = open;
      continue;
    }
    onVisibleLine(line);
  }
}

export function collectHeadings(markdown) {
  const byLevel = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
  const ordered = [];
  walkMarkdownLines(markdown, (line) => {
    const match = HEADING_RE.exec(line);
    if (!match) return;
    const level = match[1].length;
    const text = match[2].trim();
    if (!text) return;
    const key = `h${level}`;
    byLevel[key].push(text);
    ordered.push({ level, text, key });
  });
  const headings = {};
  for (const key of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    if (byLevel[key].length) headings[key] = byLevel[key];
  }
  return { headings, ordered, byLevel };
}

function stripInlineMarkdown(line) {
  let out = line;
  out = out.replace(/!\[[^\]]*]\([^)]*\)/g, "");
  out = out.replace(/\[([^\]]*)]\([^)]*\)/g, "$1");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/^#{1,6}[ \t]+/, "");
  out = out.replace(/^[ \t]*>[ \t]?/, "");
  out = out.replace(/\|/g, " ");
  out = out.replace(/[ \t]+/g, " ").trim();
  return out;
}

export function deriveText(markdown) {
  const parts = [];
  walkMarkdownLines(markdown, (line) => {
    const stripped = stripInlineMarkdown(line);
    if (!stripped) return;
    if (/^[-*:]+$/.test(stripped)) return;
    parts.push(stripped);
  });
  return parts.join("\n");
}

export function extractMarkdownFacts(markdown) {
  const { headings, ordered, byLevel } = collectHeadings(markdown);
  const title = normalizeTitleFact(byLevel.h1[0] ?? ordered[0]?.text ?? "");
  return {
    title,
    headings,
    text: deriveText(markdown),
  };
}
