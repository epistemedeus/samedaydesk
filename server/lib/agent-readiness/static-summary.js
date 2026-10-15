// Visible homepage text after scripts and styles are removed.
// noscript is kept: a no-JS client sees that copy and does not see the script.
// A product sentence can be short: the first sentence of 4 to 40 words counts.
// Six words is enough for "A custodial institution of good standing."

const POINTER_RE = /llms\.txt|openapi|(?:^|\/)mcp(?:\/|$|\?)|(?:^|\/)api(?:\/|\.|$|\?)|agent-card/i;
const NAMED_ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  mdash: " ",
  ndash: " ",
  hellip: " ",
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return " ";
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? " " : named;
  });
}

function wordCountOf(sentence) {
  return sentence.split(/\s+/).filter(Boolean).length;
}

export function summarizeStaticHtml(html) {
  let source = String(html || "");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  source = source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const hrefs = [];
  for (const match of source.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    hrefs.push(match[1] || match[2] || match[3] || "");
  }
  const text = decodeEntities(source.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ") : [];
  const sentences = text ? text.split(/(?<=[.!?])\s+/) : [];
  const excerpt = sentences.find((sentence) => {
    const count = wordCountOf(sentence);
    return count >= 4 && count <= 40;
  }) || "";
  const pointers = [];
  const candidates = hrefs.slice();
  for (const match of text.matchAll(/https?:\/\/[^\s)<>"']+/g)) candidates.push(match[0]);
  for (const href of candidates) {
    if (!href || pointers.includes(href) || !POINTER_RE.test(href)) continue;
    pointers.push(href);
    if (pointers.length >= 8) break;
  }
  return {
    wordCount: words.length,
    saysWhatItIs: excerpt.length > 0,
    excerpt,
    pointers,
  };
}

export function staticSummaryReason(summary) {
  const says = summary.saysWhatItIs
    ? `Says what the product is: "${summary.excerpt}"`
    : "Does not say what the product is.";
  const points = summary.pointers.length
    ? `Points to: ${summary.pointers.join(", ")}.`
    : "No pointer to API, OpenAPI, MCP, or llms.txt.";
  return `${summary.wordCount} words of visible text. ${says} ${points}`;
}
