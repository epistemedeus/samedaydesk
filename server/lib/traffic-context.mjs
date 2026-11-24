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
  if (!trusted) return { ip: peer, country: null, source: 'transport_peer' };
  const name = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
  const ip = name(policy.clientIpHeader) ? address(header(req, policy.clientIpHeader)) : null;
  const country = name(policy.countryHeader) ? header(req, policy.countryHeader) : null;
  return { ip, country: /^[A-Z]{2}$/.test(country ?? '') && !['XX','ZZ'].includes(country) ? country : null, source: 'enrolled_proxy' };
}
const crawlers = [
  ['Googlebot', /\bGooglebot(?:-Image|-Video|-News)?\b/i],
  ['bingbot', /\bbingbot\b/i], ['GPTBot', /\bGPTBot\b/i],
  ['OAI-SearchBot', /\bOAI-SearchBot\b/i], ['ChatGPT-User', /\bChatGPT-User\b/i],
];
export function trafficContext(req, path, { scriptRan = false, interacted = false, policy, ranges, now = Date.now() } = {}) {
  const ua = (header(req, 'user-agent') ?? '').slice(0, 2048);
  const { ip, country, source: ingressSource } = ingress(req, policy);
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
  return { schema: trafficSchema, path: pagePath(path), coarseClass: verified ? 'crawler_verified' : coarseClass, crawler,
    crawlerVerification: verified ? 'published_range' : 'unverified',
    scriptRan: scriptRan === true, interacted: scriptRan === true && interacted === true, country,
    countrySource: country ? 'enrolled_cdn_header' : 'unknown',
    verificationSource: verified ? ingressSource : 'unknown' };
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
const classes = new Set(['crawler_verified','crawler_declared','agent_declared','headless','scanner_declared','browser','unknown']);
export function safeTraffic(value) {
  if (!value || value.schema !== trafficSchema || !classes.has(value.coarseClass) ||
      typeof value.scriptRan !== 'boolean' || typeof value.interacted !== 'boolean') return null;
  const crawler = rangeSources.some(p => p.name === value.crawler) ? value.crawler : null;
  const verified = value.coarseClass === 'crawler_verified' && crawler && value.crawlerVerification === 'published_range' &&
    ['transport_peer','enrolled_proxy'].includes(value.verificationSource);
  return { schema: trafficSchema, path: pagePath(value.path),
    coarseClass: value.coarseClass === 'crawler_verified' && !verified ? 'crawler_declared' : value.coarseClass,
    crawler, crawlerVerification: verified ? 'published_range' : 'unverified',
    scriptRan: value.scriptRan, interacted: value.scriptRan && value.interacted,
    country: value.countrySource === 'enrolled_cdn_header' && /^[A-Z]{2}$/.test(value.country ?? '') && !['XX','ZZ'].includes(value.country) ? value.country : null,
    countrySource: value.countrySource === 'enrolled_cdn_header' ? 'enrolled_cdn_header' : 'unknown',
    verificationSource: verified ? value.verificationSource : 'unknown' };
}
export function trafficProjection(rows, qaSessions = new Set()) {
  const blank = () => ({ people: 0, agents: 0, scanners: 0, own: 0, unknown: 0 });
  const counts = blank(), pages = new Map();
  const coverage = { total: rows.length, context: 0, path: 0, coarseClass: 0, scriptFlag: 0,
    interactionFlag: 0, country: 0, verifiedCrawlers: 0, unverifiedCrawlerClaims: 0, declaredAgents: 0,
    firstEvidenceAt: null };
  for (const row of rows) {
    const t = safeTraffic(row.traffic);
    const path = t?.path ?? pagePath(row.path) ?? '(unknown)';
    if (t) {
      coverage.context++;
      if (t.path) coverage.path++;
      coverage.coarseClass++; coverage.scriptFlag++; coverage.interactionFlag++;
      if (t.country) coverage.country++;
      if (t.coarseClass === 'crawler_verified') coverage.verifiedCrawlers++;
      if (t.coarseClass === 'crawler_declared') coverage.unverifiedCrawlerClaims++;
      if (t.coarseClass === 'agent_declared') coverage.declaredAgents++;
      const at = row.at instanceof Date ? row.at.toISOString() : row.at;
      if (typeof at === 'string' && Number.isFinite(Date.parse(at)) && (!coverage.firstEvidenceAt || at < coverage.firstEvidenceAt)) coverage.firstEvidenceAt = at;
    }
    const kind = row.test || qaSessions.has(row.session) ? 'own' : !t ? 'unknown' :
      ['crawler_verified','agent_declared'].includes(t.coarseClass) ? 'agents' :
      ['headless','scanner_declared'].includes(t.coarseClass) ? 'scanners' :
      t.coarseClass === 'browser' && t.scriptRan && t.interacted ? 'people' : 'unknown';
    counts[kind]++;
    if (!pages.has(path)) pages.set(path, { path, ...blank() });
    pages.get(path)[kind]++;
  }
  return { schema: 'journey.traffic.daily.v1', counts, pages: [...pages.values()].sort((a,b) => a.path.localeCompare(b.path)), coverage,
    peopleMeaning: 'script ran and interacted; not proof of human identity',
    agentMeaning: 'declared agents and published-range-verified crawlers; not proof of independent use',
    unit: 'retained session/page/day observations, not unique visitors',
    legacy: 'Historical rows without traffic evidence stay unknown. firstEvidenceAt is the first retained new observation in this window, not full-day coverage or a historical backfill.' };
}
export function trafficLine(report) {
  const show = c => `people ${c.people} (script ran and interacted), agents ${c.agents}, scanners ${c.scanners}, own ${c.own}, unknown ${c.unknown}`;
  const f = report.coverage;
  return `${show(report.counts)}; pages ${JSON.stringify(report.pages)}; context ${f.context}/${f.total}, country ${f.country}/${f.total}, verified crawlers ${f.verifiedCrawlers}, unverified crawler claims ${f.unverifiedCrawlerClaims}, declared agents ${f.declaredAgents}; first evidence ${f.firstEvidenceAt ?? 'unknown'}; historical missing evidence stays unknown`;
}
