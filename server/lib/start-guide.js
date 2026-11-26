import { readFileSync } from "node:fs";

export const START_GUIDE_PATH = "/start.md";
export const START_GUIDE_LINK = '<https://samedaydesk.com/start.md>; rel="alternate"; type="text/markdown"';

const indexHeading = "## Start here\n\n";
const indexEntry = "- [SameDayDesk start guide](https://samedaydesk.com/start.md): run the free route check and bring back the first repair.\n";

export function indexWithStartGuide(source) {
  if (/\[[^\]]+\]\(https:\/\/samedaydesk\.com\/start\.md\)/.test(source)) return source;
  if (source.includes(indexHeading)) return source.replace(indexHeading, indexHeading + indexEntry);
  return source.replace(/^(#[^\n]*\n)/, "$1\n" + indexHeading + indexEntry);
}

export function startGuideMarkdown() {
  return readFileSync(new URL("../../client/public/start.md", import.meta.url), "utf8");
}

function parseAccept(header) {
  return String(header || "")
    .split(",")
    .map((part) => {
      const [range, ...params] = part.trim().split(";").map((s) => s.trim());
      const qParam = params.find((param) => param.toLowerCase().startsWith("q="));
      const q = qParam == null ? 1 : Number(qParam.slice(2));
      const [type, subtype] = (range || "").toLowerCase().split("/");
      return { type, subtype, q: Number.isFinite(q) && q > 0 ? q : 0 };
    })
    .filter((range) => range.type && range.subtype && range.q > 0);
}

function matchQuality(ranges, type, subtype) {
  let bestQ = 0;
  let bestSpecificity = -1;
  for (const range of ranges) {
    const specificity =
      range.type === type && range.subtype === subtype ? 2
        : range.type === type && range.subtype === "*" ? 1
          : range.type === "*" && range.subtype === "*" ? 0
            : -1;
    if (specificity < 0) continue;
    if (specificity > bestSpecificity || (specificity === bestSpecificity && range.q > bestQ)) {
      bestSpecificity = specificity;
      bestQ = range.q;
    }
  }
  return { q: bestSpecificity < 0 ? 0 : bestQ, explicit: bestSpecificity === 2 };
}

export function prefersMarkdown(accept) {
  const ranges = parseAccept(accept);
  if (ranges.length === 0) return false;
  const markdown = matchQuality(ranges, "text", "markdown");
  const html = matchQuality(ranges, "text", "html");
  if (markdown.q === 0) return false;
  if (markdown.q !== html.q) return markdown.q > html.q;
  return markdown.explicit;
}
