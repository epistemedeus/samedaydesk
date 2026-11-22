import robotsParser from 'robots-parser';
import { parseX402Challenge } from 'agent-payment-integrity';
import { fetchPublicBounded, createRequestBudget } from '../agent-readiness/bounded-fetch.js';
import { looksLikeChallenge } from '../agent-readiness/retrieval.js';
import { assertPublicHostname } from '../agent-readiness/ssrf.js';
import { analyzeDocument, publicLink, excerpt } from './facts.js';
import { evaluateReport } from './rules.js';

export const TOTAL_MS = 18_000;
export const AGENTS = Object.freeze([
  { agent: 'GPTBot', purpose: 'training' }, { agent: 'OAI-SearchBot', purpose: 'search' },
  { agent: 'ChatGPT-User', purpose: 'user-request' }, { agent: 'ClaudeBot', purpose: 'training' },
  { agent: 'Claude-User', purpose: 'user-request' }, { agent: 'PerplexityBot', purpose: 'search' },
  { agent: 'Google-Extended', purpose: 'training', requestAgent: 'Googlebot' },
  { agent: 'Applebot-Extended', purpose: 'training', requestAgent: 'Applebot' },
  { agent: 'CCBot', purpose: 'training' }, { agent: 'meta-externalagent', purpose: 'training' },
  { agent: 'Googlebot', purpose: 'search' }, { agent: 'Bingbot', purpose: 'search' },
]);
export function normalizeInput(raw) {
  let value = String(raw || '').trim();
  if (!value || value.length > 2048 || /\s/.test(value)) throw Object.assign(Error('Enter one public website URL.'), { status: 400 });
  // Another scheme is refused, not read as a host name (ftp://site.com would become host "ftp").
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) throw Object.assign(Error('Use a public HTTP or HTTPS website without credentials or a custom port.'), { status: 400 });
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw Object.assign(Error('Enter a valid website URL.'), { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw Object.assign(Error('Use a public HTTP or HTTPS website without credentials or a custom port.'), { status: 400 });
  assertPublicHostname(url.hostname);
  // The checker is for public pages. Query values can contain private tokens.
  url.search = ''; url.hash = '';
  return url;
}
const asJson = (probe) => { try { return probe?.ok && !probe.oversize ? JSON.parse(probe.body) : null; } catch { return null; } };
export function protocolValidity(kind, probe) {
  const data = asJson(probe);
  if (!data || typeof data !== 'object' || Array.isArray(data) || probe.challenge) return false;
  if (kind === 'openapi') return /^3\./.test(data.openapi || '') && data.paths && Object.values(data.paths).some((path) => path && ['get', 'post', 'put', 'patch', 'delete'].some((method) => path[method]?.responses));
  if (kind === 'a2a') return Boolean(data.name && (data.url || data.supportedInterfaces?.some((item) => item.url)) && Array.isArray(data.skills) && data.skills.length);
  if (kind === 'mcp') return Boolean(data.name && (data.url || data.remote?.url || data.remotes?.some((item) => item.url)) && (data.protocolVersion || data.schemaVersion || data.$schema?.includes('server.schema')));
  if (kind === 'feeds') return Boolean((data.ucp?.version && data.ucp?.services && Object.keys(data.ucp.services).length) || data.protocol === 'acp' && Array.isArray(data.products) && data.products.length);
  return false;
}
async function pool(jobs, count = 6) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(count, jobs.length) }, async () => {
    while (index < jobs.length) { const job = jobs[index++]; await job(); }
  }));
}
export async function collectObservation(raw, { signal, onProgress = () => {}, fetcher = fetchPublicBounded, lookup, renderer, cruxKey = process.env.SDS_FREE_CHECK_CRUX_API_KEY } = {}) {
  const url = normalizeInput(raw);
  const budget = createRequestBudget(TOTAL_MS, signal);
  const observation = { url: url.href, probes: {}, bots: [], requests: [], policies: [], robotsUrl: new URL('/robots.txt', url).href };
  const started = Date.now();
  const read = async (target, options = {}) => {
    const clean = publicLink(target, url);
    if (!clean || budget.exhausted) return { status: 0, ok: false, body: '', finalUrl: clean || url.href, failure: 'deadline' };
    const begin = Date.now();
    let result;
    try {
      const { crossOrigin, ...rest } = options;
      // RFC 9309 2.3.1.2: robots.txt redirects are followed, also to another host (www.wikipedia.org
      // sends en.wikipedia.org). Each hop is admitted again as a public address.
      for (let hop = 0, next = clean, opts = rest; ; hop += 1) {
        try { result = await fetcher(next, { maxBytes: 700_000, timeoutMs: Math.min(4000, budget.remaining()), budget, lookup, allowHostVariants: true, includeHeaders: true, ...opts }); break; }
        catch (error) {
          const to = crossOrigin && error.code === 'off_origin_redirect' && hop < 4 && publicLink(error.location, next);
          if (!to) throw error;
          next = to; opts = { ...rest, allowedOrigin: new URL(to).origin };
        }
      }
      result.challenge = looksLikeChallenge(result);
    } catch (error) {
      result = { status: 0, ok: false, body: '', finalUrl: clean, failure: ['private_address', 'invalid_host'].includes(error.code) ? 'public-address-refused' : error.code === 'off_origin_redirect' ? 'redirected-off-site' : budget.exhausted ? 'deadline' : 'unreachable' };
    }
    observation.requests.push({ url: clean, method: options.method || 'GET', status: result.status, ms: Date.now() - begin, failure: result.failure || null, userAgent: options.userAgent || 'SameDayDeskAgentReadiness/1.0' });
    onProgress({ kind: 'fetch', url: clean, status: result.status, ms: Date.now() - begin });
    return result;
  };
  try {
    onProgress({ kind: 'start', url: url.href, budgetMs: TOTAL_MS });
    observation.page = await read(url.href, { maxBytes: 2_500_000, timeoutMs: 6000 });
    observation.timingMs = Date.now() - started;
    const page = observation.page;
    if (page.status === 402 && page.headers?.['payment-required']) {
      const parsed = parseX402Challenge(page.headers['payment-required']);
      observation.probes.payment = { status: 402, valid: !parsed.error, error: parsed.error, networks: parsed.accepts?.map((item) => item.network) };
    }
    if (!page.status || page.challenge || !page.ok || page.oversize || !/text\/html|application\/xhtml\+xml/i.test(page.contentType)) {
      observation.document = null;
      return observation;
    }
    observation.url = page.finalUrl;
    const origin = new URL(page.finalUrl).origin;
    observation.document = analyzeDocument(page.body, page.finalUrl);
    const doc = observation.document;
    onProgress({ kind: 'finding', label: 'Text without JavaScript', detail: `${doc.words} words in initial HTML.`, url: page.finalUrl });
    const fixed = { robots: '/robots.txt', sitemap: '/sitemap.xml', llms: '/llms.txt', mcp: '/.well-known/mcp/server.json', a2a: '/.well-known/agent-card.json', openapi: '/openapi.json', feeds: '/.well-known/ucp' };
    await pool(Object.entries(fixed).map(([key, path]) => async () => {
      observation.probes[key] = key === 'robots'
        ? await read(new URL(path, origin).href, { allowedOrigin: origin, maxBytes: 512_000, crossOrigin: true })
        : await read(new URL(path, origin).href, { allowedOrigin: origin, maxBytes: 250_000 });
    }));
    const robots = observation.probes.robots;
    observation.robotsUrl = new URL('/robots.txt', origin).href;
    // An oversized file is parsed up to the 500 KiB that RFC 9309 asks crawlers to read.
    const robot = robots?.ok && !robots.challenge ? robotsParser(observation.robotsUrl, robots.body) : null;
    observation.policies = AGENTS.map((item) => ({ ...item,
      allowed: robot ? robot.isAllowed(page.finalUrl, item.agent) ?? true : robots?.status === 404 || robots?.status === 410 ? true : null,
      note: item.requestAgent ? `${item.agent} is a control token, not a distinct HTTP user agent. ${item.requestAgent} is requested separately.` : item.purpose === 'user-request' ? 'User-triggered fetch behavior may differ from robots policy.' : item.purpose === 'training' ? 'Training opt-outs are not treated as AI search failures.' : null,
    }));
    for (const key of ['mcp', 'a2a', 'openapi', 'feeds']) observation.probes[key].valid = protocolValidity(key, observation.probes[key]);
    // An MCP endpoint the site names in its own guide or agent card (https://ein.llc/mcp) is not
    // absent just because /.well-known/mcp/server.json is. It is not called from here.
    const site = new URL(origin).hostname.replace(/^www\./, '');
    observation.probes.mcp.declared = [observation.probes.llms, observation.probes.a2a].flatMap((probe) => probe?.ok ? [...String(probe.body).matchAll(/https:\/\/[^\s)"'<>\]]+/g)].map((match) => publicLink(match[0], origin)) : [])
      .find((link) => link && /\/mcp\/?$/.test(new URL(link).pathname) && (new URL(link).hostname === site || new URL(link).hostname.endsWith(`.${site}`))) || null;
    const sameOrigin = (link) => new URL(link.url).origin === origin;
    const jobs = AGENTS.map((item) => async () => {
      const result = await read(page.finalUrl, { userAgent: `${item.requestAgent || item.agent}/1.0`, maxBytes: 100_000 });
      observation.bots.push({ agent: item.agent, requestedAs: item.requestAgent || item.agent, status: result.status, challenge: result.challenge || false });
    });
    for (const [key, regex] of [['about', /\babout\b|\/about(?:\/|$)/i], ['contact', /\bcontact\b|\/contact(?:\/|$)/i], ['pricing', /pricing|services|plans/i]]) {
      const link = doc.links.find((item) => sameOrigin(item) && regex.test(`${item.label} ${item.url}`));
      if (link) jobs.push(async () => { observation.probes[key] = await read(link.url, { allowedOrigin: origin, maxBytes: 150_000 }); });
    }
    const action = doc.links.find((item) => /\b(?:buy|book|order|checkout|schedule|shop)\b/i.test(item.label));
    if (action) jobs.push(async () => {
      const result = await read(action.url, { method: 'HEAD', maxBytes: 0 });
      result.loginWall = /\/(?:login|signin|sign-in|auth)(?:[/?#]|$)/i.test(result.finalUrl) || [401, 403].includes(result.status);
      observation.probes.action = result;
    });
    if (doc.markdown[0] && new URL(doc.markdown[0]).origin === origin) jobs.push(async () => { observation.probes.markdown = await read(doc.markdown[0], { allowedOrigin: origin }); });
    const sitemapLink = robot?.getSitemaps().map((value) => publicLink(value, origin)).find((value) => value && new URL(value).origin === origin);
    if (sitemapLink && !/<urlset\b|<sitemapindex\b/i.test(observation.probes.sitemap.body)) jobs.push(async () => { observation.probes.sitemap = await read(sitemapLink, { allowedOrigin: origin, maxBytes: 250_000 }); });
    const llms = observation.probes.llms;
    llms.bytes = Buffer.byteLength(llms.body || '');
    llms.sections = (llms.body.match(/^#{1,3}\s+\S/gm) || []).length;
    const guideLinks = [...llms.body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((match) => publicLink(match[1], origin)).filter((value) => value && new URL(value).origin === origin);
    llms.linkChecks = [];
    for (const target of [...new Set(guideLinks)].slice(0, 2)) jobs.push(async () => { const response = await read(target, { method: 'HEAD', maxBytes: 0 }); llms.linkChecks.push({ url: target, status: response.status }); });
    if (renderer) jobs.push(async () => {
      try { observation.rendered = await renderer({ url: page.finalUrl, signal: budget.signal, initialWords: doc.words }); }
      catch { /* A failed browser measurement stays unknown. */ }
    });
    if (cruxKey) jobs.push(async () => {
      // Existing enrolled read-only key only. No project, key or paid service is created.
      try {
        const response = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(cruxKey)}`, { method: 'POST', signal: budget.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ origin, formFactor: 'PHONE' }) });
        const data = await response.json();
        const metrics = data.record?.metrics;
        if (response.ok && metrics) {
          const values = ['largest_contentful_paint', 'cumulative_layout_shift', 'interaction_to_next_paint'].map((key) => Number(metrics[key]?.percentiles?.p75));
          observation.crux = values.every(Number.isFinite) ? { metrics: values, collectionPeriod: data.record.collectionPeriod, origin, good: values[0] <= 2500 && values[1] <= 0.1 && values[2] <= 200 } : { reason: 'CrUX did not return all three field metrics.' };
        } else observation.crux = { reason: 'No matching CrUX field record was received.' };
      } catch { observation.crux = { reason: 'The CrUX read did not complete.' }; }
    });
    await pool(jobs);
    llms.guideValid = llms.ok && !llms.challenge && !llms.oversize && llms.bytes <= 100_000 && llms.sections >= 2 && llms.linkChecks.length > 0 && llms.linkChecks.every((link) => link.status >= 200 && link.status < 400);
    const publicPages = [doc, ...['about', 'contact'].filter((key) => observation.probes[key]?.ok && !observation.probes[key].challenge).map((key) => analyzeDocument(observation.probes[key].body, observation.probes[key].finalUrl))];
    const identifiers = publicPages.map((page) => page.entities.map((entity) => ({ name: String(entity.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), phone: String(entity.telephone || '').replace(/\D/g, ''), address: typeof entity.address === 'object' ? ['streetAddress', 'postalCode'].map((key) => entity.address?.[key] || '').join(' ').trim().toLowerCase() : '' }))).filter((items) => items.length);
    if (identifiers.length >= 2) {
      const first = identifiers[0][0];
      const match = identifiers.slice(1).flat().find((other) => other.name && other.name === first.name && other.phone && first.phone && other.address && first.address);
      if (match) observation.identity = { consistent: first.phone === match.phone && first.address === match.address, detail: 'Matching entity names were compared across linked pages for address and phone.', evidence: [{ kind: 'entity-fields', value: JSON.stringify({ first, other: match }), url: page.finalUrl }] };
    }
    // Interpret only a challenge actually returned by a safe public read. Do not
    // probe charge-producing GET URLs or invent an unpaid payment attempt.
    const paymentRequired = page.headers?.['payment-required'];
    if (page.status === 402 && paymentRequired) {
      const parsed = parseX402Challenge(paymentRequired);
      observation.probes.payment = { status: 402, valid: !parsed.error, error: parsed.error, networks: parsed.accepts?.map((item) => item.network) };
    } else {
      const contract = observation.probes.openapi;
      observation.probes.payment = { status: contract.status, documented: contract.valid && /"(?:402|x-payment|x-x402|x-mpp)"/i.test(contract.body) };
    }
    return observation;
  } finally { observation.elapsedMs = Date.now() - started; budget.dispose(); }
}
export async function runFreeCheck(raw, options) {
  const observation = await collectObservation(raw, options);
  const report = evaluateReport(observation);
  return { ...report, elapsedMs: observation.elapsedMs };
}
