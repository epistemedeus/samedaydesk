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
