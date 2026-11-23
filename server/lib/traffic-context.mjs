// Shared journey context, v1. Addresses and UA are transient inputs only.
import { BlockList, isIP } from 'node:net';
export const trafficSchema = 'journey.traffic.v1';
export function pagePath(value) {
  if (typeof value !== 'string') return null;
  const path = value.split(/[?#]/, 1)[0];
  return /^\/(?!\/)[^\s\\\u0000-\u001f\u007f]{0,300}$/.test(path) ? path : null;
}
function address(value) {
  if (typeof value !== 'string') return null;
  const ip = value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
  return isIP(ip) ? ip : null;
}
function inRanges(ip, cidrs) {
  if (!ip || !Array.isArray(cidrs) || !cidrs.length) return false;
  try {
    const block = new BlockList();
    for (const cidr of cidrs) {
      const [base, bits, extra] = cidr.split('/');
      if (extra || !isIP(base) || !/^\d{1,3}$/.test(bits)) return false;
      block.addSubnet(base, Number(bits), isIP(base) === 4 ? 'ipv4' : 'ipv6');
    }
    return block.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  } catch { return false; }
}
const header = (req, key) => typeof req.headers?.[key] === 'string' ? req.headers[key] : null;
// A policy is enrolled by the controller after observing the actual proxy route.
// Only one trusted peer and one overwritten single-address header are accepted.
export function ingress(req, policy) {
  const peer = address(req.socket?.remoteAddress);
  const trusted = policy?.schema === 'journey.ingress.v1' && policy.overwritesHeaders === true &&
    typeof policy.receipt === 'string' && policy.receipt.length > 0 && inRanges(peer, policy.peerCidrs);
  if (!trusted) return { ip: peer, country: null };
  const name = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
  const ip = name(policy.clientIpHeader) ? address(header(req, policy.clientIpHeader)) : null;
  const country = name(policy.countryHeader) ? header(req, policy.countryHeader) : null;
  return { ip, country: /^[A-Z]{2}$/.test(country ?? '') && !['XX','ZZ'].includes(country) ? country : null };
}
const crawlers = [
  ['Googlebot', /\bGooglebot(?:-Image|-Video|-News)?\b/i],
  ['bingbot', /\bbingbot\b/i], ['GPTBot', /\bGPTBot\b/i],
  ['OAI-SearchBot', /\bOAI-SearchBot\b/i], ['ChatGPT-User', /\bChatGPT-User\b/i],
];
export function trafficContext(req, path, { scriptRan = false, interacted = false, policy, ranges, now = Date.now() } = {}) {
  const ua = (header(req, 'user-agent') ?? '').slice(0, 2048);
  const { ip, country } = ingress(req, policy);
  const claims = crawlers.filter(([, re]) => re.test(ua));
  const crawler = claims.length === 1 ? claims[0][0] : null;
  const coarseClass = claims.length || /bot|crawler|spider/i.test(ua) ? 'crawler_declared' :
    /headless|phantomjs|playwright|puppeteer/i.test(ua) ? 'headless' :
    /sqlmap|nikto|nuclei|masscan|zgrab/i.test(ua) ? 'scanner_declared' :
    /agent|curl\/|wget\/|python|httpx|Go-http-client|node-fetch|axios\//i.test(ua) ? 'agent_declared' :
    /Mozilla\//.test(ua) ? 'browser' : 'unknown';
  const source = (ranges?.schema === 'journey.crawler-ranges.v1' && Array.isArray(ranges.providers) ? ranges.providers : []).find(p => p?.name === crawler);
  const age = now - Date.parse(ranges?.readAt);
  const verified = Boolean(crawler && source && age >= 0 && age <= 7 * 86400000 &&
    source.url === rangeSources.find(p => p?.name === crawler)?.url && inRanges(ip, source.cidrs));
  return { schema: trafficSchema, path: pagePath(path), coarseClass, crawler,
    crawlerVerification: verified ? 'published_range' : 'unverified',
    scriptRan: scriptRan === true, interacted: scriptRan === true && interacted === true, country };
}
export const rangeSources = [
  { name: 'Googlebot', url: 'https://developers.google.com/static/crawling/ipranges/common-crawlers.json' },
  { name: 'bingbot', url: 'https://www.bing.com/toolbox/bingbot.json' },
  { name: 'GPTBot', url: 'https://openai.com/gptbot.json' },
  { name: 'OAI-SearchBot', url: 'https://openai.com/searchbot.json' },
  { name: 'ChatGPT-User', url: 'https://openai.com/chatgpt-user.json' },
];
export function trafficPolicy(env = process.env) {
  try { return JSON.parse(env.JOURNEY_INGRESS_POLICY); } catch { return null; }
}
export function trafficProjection(rows, qaSessions = new Set()) {
  const counts = { people: 0, agents: 0, scanners: 0, own: 0, unknown: 0 };
  const coverage = { total: rows.length, context: 0, path: 0, coarseClass: 0, scriptFlag: 0,
    interactionFlag: 0, country: 0, verifiedCrawlers: 0, unverifiedCrawlerClaims: 0, declaredAgents: 0 };
  for (const row of rows) {
    const t = row.traffic;
    const known = t?.schema === trafficSchema;
    if (known) {
      coverage.context++;
      if (pagePath(t.path)) coverage.path++;
      if (typeof t.coarseClass === 'string') coverage.coarseClass++;
      if (typeof t.scriptRan === 'boolean') coverage.scriptFlag++;
      if (typeof t.interacted === 'boolean') coverage.interactionFlag++;
      if (/^[A-Z]{2}$/.test(t.country ?? '')) coverage.country++;
      if (t.coarseClass === 'crawler_declared') {
        if (t.crawlerVerification === 'published_range') coverage.verifiedCrawlers++;
        else coverage.unverifiedCrawlerClaims++;
      }
      if (t.coarseClass === 'agent_declared') coverage.declaredAgents++;
    }
    const kind = row.test || qaSessions.has(row.session) ? 'own' : !known ? 'unknown' :
      t.crawlerVerification === 'published_range' && t.crawler ? 'agents' :
      ['headless', 'scanner_declared'].includes(t.coarseClass) ? 'scanners' :
      t.coarseClass === 'browser' && t.scriptRan === true && t.interacted === true ? 'people' : 'unknown';
    counts[kind]++;
  }
  return { schema: 'journey.traffic.daily.v1', counts, coverage,
    peopleMeaning: 'script ran and interacted; not proof of human identity',
    unit: 'retained visit observations, not unique visitors', legacy: 'old rows stay unknown' };
}
export function trafficLine(report) {
  const c = report.counts, f = report.coverage;
  return `people ${c.people} (script ran and interacted), agents ${c.agents} (published ranges), scanners ${c.scanners} (declared or headless), own ${c.own}, unknown ${c.unknown}; context ${f.context}/${f.total}, country ${f.country}/${f.total}, unverified crawler claims ${f.unverifiedCrawlerClaims}, declared agents ${f.declaredAgents}`;
}
