import { readFileSync } from "node:fs";

export const START_GUIDE_PATH = "/start.md";
export const START_GUIDE_LINK = '<https://samedaydesk.com/start.md>; rel="alternate"; type="text/markdown"';

export function startGuideMarkdown() {
  return readFileSync(new URL("../../client/public/start.md", import.meta.url), "utf8");
}
