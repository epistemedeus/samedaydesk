import { MCP_REL } from "./rules.mjs";

const OKMSG_RE = /const okMsg = \(id, result\) => \(\{ jsonrpc: "2\.0", id, result \}\)/;
const ERRMSG_RE = /const errMsg = \(id, code, message\) => \(\{ jsonrpc: "2\.0", id, error: \{ code, message \} \}\)/;
const FIXPACK_RE = /const FIXPACK_LINK = "(https:\/\/buy\.stripe\.com\/[^"]+)"/;
const HTTP_JSON_RE = /return res\.json\(out\)/;

export const REQUIRED_SNIPPETS = Object.freeze([
  {
    id: "missing_url",
    needle: 'Provide a url, e.g. example.com',
    text: "Provide a url, e.g. example.com",
  },
  {
    id: "unpaid_fixpack",
    needle: "No license provided.",
    text: "No license provided.",
  },
  {
    id: "generation_failed",
    needle: "Your payment is verified, but auto-generation hit an error",
    text: "Your payment is verified, but auto-generation hit an error (timeout). Email help@samedaydesk.com with your url (example.com) and license and we'll deliver your Fix Pack right away.",
  },
  {
    id: "taskmarket_error",
    needle: "TaskMarket tool error:",
    text: "TaskMarket tool error: reward_usdc exceeds max_spend_usdc",
  },
  {
    id: "check_failed",
    needle: "Could not check ${url}:",
    text: "Could not check example.com: fetch failed",
  },
]);

export function lineNumberAt(src, index) {
  if (index < 0) return 0;
  return src.slice(0, index).split("\n").length;
}

export function extractIsErrorSites(src) {
  const lines = String(src).split("\n");
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/isError:\s*true/.test(lines[i])) continue;
    let from = i;
    while (
      from > 0 &&
      !/\breturn\s+(okMsg|errMsg)\s*\(/.test(lines[from]) &&
      !/^\s*return\s+okMsg\s*\(/.test(lines[from])
    ) {
      from -= 1;
      if (i - from > 12) break;
    }
    const block = lines.slice(from, i + 1).join("\n");
    sites.push({
      line: i + 1,
      viaOkMsg: /okMsg\s*\(/.test(block),
      viaErrMsg: /errMsg\s*\(/.test(block),
      lineText: lines[i].trim(),
    });
  }
  return sites;
}

export function analyzeMcpSource(src) {
  const text = String(src);
  const fixpack = text.match(FIXPACK_RE);
  const snippets = REQUIRED_SNIPPETS.map((item) => ({
    id: item.id,
    present: text.includes(item.needle),
    needle: item.needle,
  }));
  return {
    okMsg: OKMSG_RE.test(text),
    errMsg: ERRMSG_RE.test(text),
    httpJson: HTTP_JSON_RE.test(text),
    fixpackLink: fixpack ? fixpack[1] : null,
    sites: extractIsErrorSites(text),
    snippets,
    missingSnippets: snippets.filter((item) => !item.present).map((item) => item.id),
    surface: MCP_REL,
  };
}

export function derivedIsErrorCases(analysis) {
  const http = { status: 200 };
  const cases = [];
  for (const snippet of REQUIRED_SNIPPETS) {
    const present = analysis.snippets.find((item) => item.id === snippet.id)?.present;
    if (!present) continue;
    let text = snippet.text;
    if (snippet.id === "unpaid_fixpack" && analysis.fixpackLink) {
      text = `No license provided.\n\nTo get the complete Fix Pack: buy at ${analysis.fixpackLink} ($39). After paying you'll see your license code; call this tool again with url + that license.`;
    }
    cases.push({
      id: `committed-${snippet.id}`,
      snippet: snippet.id,
      input: {
        http,
        rpc: {
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text }],
            isError: true,
          },
        },
      },
    });
  }
  return cases;
}
