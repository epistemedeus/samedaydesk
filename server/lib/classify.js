// Request classes, so the traffic numbers say what they mean.
//
//   A  crawler        a declared indexing or training fetcher
//   B  agent fetch    a machine acting for a person right now (assistant browsing, API client)
//   C  human AI click  a browser arriving from an AI surface
//   D  human unknown   a browser with no usable referrer
//   E  unresolved      not enough signal to say
//
// Never recode D as C. A direct visit is a direct visit, even on a day when it would be
// convenient to call it an AI referral.
const CRAWLERS = [
  ["GPTBot", /GPTBot/i],
  ["OAI-SearchBot", /OAI-SearchBot/i],
  ["ClaudeBot", /ClaudeBot/i],
  ["Claude-SearchBot", /Claude-SearchBot/i],
  ["PerplexityBot", /PerplexityBot/i],
  ["Google-Extended", /Google-Extended/i],
  ["Googlebot", /Googlebot/i],
  ["Bingbot", /bingbot/i],
  ["Applebot-Extended", /Applebot-Extended/i],
  ["CCBot", /CCBot/i],
  ["Bytespider", /Bytespider/i],
  ["Amazonbot", /Amazonbot/i],
  ["Meta-ExternalAgent", /Meta-ExternalAgent|FacebookBot/i],
  ["DuckAssistBot", /DuckAssistBot/i],
  ["YouBot", /YouBot/i],
  ["generic-crawler", /\bbot\b|crawler|spider|slurp|crawl|semrush|ahrefs|mj12|dotbot|uptime|monitor/i],
];

// User agents that fetch on behalf of a person in the moment.
const AGENT_FETCH = [
  ["ChatGPT-User", /ChatGPT-User/i],
  ["Claude-User", /Claude-User|Claude-Web|anthropic-ai/i],
  ["Perplexity-User", /Perplexity-User/i],
  ["Gemini-User", /Google-CloudVertexBot|Gemini/i],
  ["script-client", /python-requests|curl|wget|go-http|node-fetch|axios|libwww|httpclient|scrapy|okhttp/i],
];

const AI_REFERRERS = [
  ["chatgpt.com", /(^|\.)chatgpt\.com$|(^|\.)openai\.com$/i],
  ["perplexity.ai", /(^|\.)perplexity\.ai$/i],
  ["claude.ai", /(^|\.)claude\.ai$|(^|\.)anthropic\.com$/i],
  ["gemini.google.com", /(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/i],
  ["copilot.microsoft.com", /(^|\.)copilot\.microsoft\.com$|(^|\.)bing\.com$/i],
  ["grok.com", /(^|\.)grok\.com$|(^|\.)x\.ai$/i],
];

export function refererHost(ref) {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function aiReferrer(host) {
  if (!host) return null;
  for (const [name, re] of AI_REFERRERS) if (re.test(host)) return name;
  return null;
}

export function classifyRequest({ ua, referer }) {
  const agent = String(ua || "");
  if (!agent) return { cls: "E", label: "unresolved", who: null };

  for (const [name, re] of CRAWLERS) if (re.test(agent)) return { cls: "A", label: "crawler", who: name };
  for (const [name, re] of AGENT_FETCH) if (re.test(agent)) return { cls: "B", label: "agent fetch", who: name };

  const looksLikeBrowser = /Mozilla\/5\.0/i.test(agent) && /(Chrome|Safari|Firefox|Edg)\//i.test(agent);
  if (!looksLikeBrowser) return { cls: "E", label: "unresolved", who: null };

  const host = refererHost(referer);
  const ai = aiReferrer(host);
  if (ai) return { cls: "C", label: "human from an AI surface", who: ai };
  return { cls: "D", label: "human, source unknown", who: host || null };
}
