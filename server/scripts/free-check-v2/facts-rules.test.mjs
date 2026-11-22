import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument, publicLink } from '../../lib/free-check-v2/facts.js';
import { evaluateReport, RULES } from '../../lib/free-check-v2/rules.js';
import { normalizeInput, runFreeCheck, AGENTS } from '../../lib/free-check-v2/probe.js';
import { parseX402Challenge } from 'agent-payment-integrity';
const url = 'https://business.example/';
const html = `<!doctype html><html lang="en"><head><title>A useful service for teams</title><meta name="description" content="Useful work with a public price"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${url}"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Useful","url":"${url}"}</script></head><body><h1>Useful work for your business</h1><p>Built for teams. Buy this service for 99 USD. ${'Public service facts and useful buyer information. '.repeat(50)}</p><a href="/pricing">Pricing</a><a href="/contact">Contact</a><a href="/book">Book a visit</a><form><label for="email">Email</label><input id="email" type="email"></form><img src="/decoration.svg" alt=""></body></html>`;
const response = (body = html, extra = {}) => ({ ok: true, status: 200, body, finalUrl: url, contentType: 'text/html', headers: {}, redirects: [], oversize: false, ...extra });
function observation(body = html) { return { url, page: response(body), document: analyzeDocument(body, url), probes: {}, policies: [], bots: [], timingMs: 100 }; }

test('the frozen forty checks total 60 reading, 15 answers and 25 actions', () => {
  assert.equal(RULES.length, 40); assert.equal(new Set(RULES.map((rule) => rule.id)).size, 40);
  const sum = (groups) => RULES.filter((rule) => groups.includes(rule.group)).reduce((total, rule) => total + rule.weight, 0);
  assert.equal(sum(['access', 'understanding', 'speed-mobile']), 60); assert.equal(sum(['answers']), 15); assert.equal(sum(['actions']), 25);
});
test('DOM parsing excludes scripts and hidden copy, recognizes nested schema and associated labels', () => {
  const doc = analyzeDocument(html.replace('</body>', '<p hidden>SECRET_HIDDEN</p><script>SECRET_SCRIPT</script></body>'), url);
  assert.equal(doc.visible.includes('SECRET'), false); assert.equal(doc.missingLabels.length, 0);
  assert.equal(doc.entities[0].name, 'Useful'); assert.equal(doc.priceText, '99 USD');
  assert.equal(publicLink(null, url), null); assert.equal(publicLink('javascript:alert(1)', url), null);
  assert.equal(publicLink('https://user:secret@example.com/', url), null);
});
test('a clean modern static site does not receive a perfect score or an invented agent capability', () => {
  const report = evaluateReport(observation());
  assert.ok(report.score <= 75); assert.equal(report.scoring.verifiedAction, false);
  assert.equal(report.checks.find((finding) => finding.id === 'crux').status, 'unknown');
  assert.equal(report.checks.find((finding) => finding.id === 'rendered').status, 'unknown');
  assert.equal(report.checks.find((finding) => finding.id === 'mcp').status, 'unknown');
  for (const finding of report.checks.filter((finding) => finding.status !== 'unknown')) assert.ok(finding.evidence.length);
});
test('absent optional protocols are upgrades; a malformed declared JSON block is an evidenced problem', () => {
  const seen = observation(html.replace('"@type":"Organization"', 'BROKEN'));
  seen.probes.mcp = response('not found', { status: 404, ok: false, valid: false });
  const report = evaluateReport(seen);
  assert.equal(report.checks.find((finding) => finding.id === 'jsonld').status, 'problem');
  assert.equal(report.checks.find((finding) => finding.id === 'mcp').status, 'upgrade');
});
test('training opt-outs do not become a search access failure, longest Allow wins', async () => {
  const robots = 'User-agent: GPTBot\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /\nAllow: /public/\nUser-agent: Google-Extended\nDisallow: /\n';
  const report = await runFreeCheck('https://business.example/public/', { fetcher: async (target, options) => target.endsWith('/robots.txt') ? response(robots, { finalUrl: target, contentType: 'text/plain' }) : options.userAgent || target.endsWith('/public/') ? response(html, { finalUrl: target }) : response('', { status: 404, ok: false, finalUrl: target }), cruxKey: null });
  assert.equal(report.policies.find((policy) => policy.agent === 'GPTBot').allowed, false);
  assert.equal(report.policies.find((policy) => policy.agent === 'OAI-SearchBot').allowed, true);
  assert.equal(report.checks.find((finding) => finding.id === 'robots').status, 'pass');
  assert.equal(report.requests.filter((request) => request.userAgent.endsWith('/1.0')).length >= AGENTS.length, true);
});
test('a real refusal is kept separate from a missing network measurement', async () => {
  const blocked = await runFreeCheck(url, { fetcher: async () => response('Access denied', { status: 403, ok: false }), cruxKey: null });
  assert.equal(blocked.checks.find((finding) => finding.id === 'fetch').status, 'problem');
  const missing = await runFreeCheck(url, { fetcher: async () => { throw Error('network unavailable'); }, cruxKey: null });
  assert.equal(missing.checks.find((finding) => finding.id === 'fetch').status, 'unknown');
});
test('credential, private host and non-web inputs are refused without a fetch', () => {
  for (const input of ['http://127.0.0.1/', 'http://localhost/', 'http://169.254.169.254/', 'https://user:secret@site.com/', 'ftp://site.com/', 'https://site.com:8080/']) assert.throws(() => normalizeInput(input));
  assert.equal(normalizeInput('https://business.example/?token=secret#private').href, url);
});
const base = { x402Version: 2, resource: { url: 'https://business.example/data', description: 'Public data', mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', amount: '10000', asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', payTo: 'J7aN3PLJnTCF5qpEnvJHJsnCjcGuqC2rYtEM8Gv3xwg', maxTimeoutSeconds: 300 }] };
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
test('maintained Solana profile accepts the received valid payee and rejects arbitrary printable strings', async () => {
  assert.equal(parseX402Challenge(encode(base)).error, undefined);
  const seen = await runFreeCheck(url, { fetcher: async () => response('', { status: 402, ok: false, headers: { 'payment-required': encode(base) } }), cruxKey: null });
  assert.equal(seen.checks.find((finding) => finding.id === 'payment').status, 'pass');
  for (const payTo of ['notAnAddress', 'A'.repeat(32), 'z'.repeat(44), '0'.repeat(32), '0x1111111111111111111111111111111111111111']) {
    const invalid = structuredClone(base); invalid.accepts[0].payTo = payTo;
    assert.ok(parseX402Challenge(encode(invalid)).error);
  }
});
test('network binding preserves the EVM boundary and refuses a Solana key on EVM', () => {
  const evm = structuredClone(base); Object.assign(evm.accepts[0], { network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x1111111111111111111111111111111111111111' });
  assert.equal(parseX402Challenge(encode(evm)).error, undefined);
  evm.accepts[0].payTo = base.accepts[0].payTo; assert.ok(parseX402Challenge(encode(evm)).error);
});
test('a noindex directive is an explicit search finding, not an indexing lookup', () => {
  const seen = observation(); seen.page.headers['x-robots-tag'] = 'noindex';
  seen.policies = [{ agent: 'Googlebot', purpose: 'search', allowed: true }];
  const finding = evaluateReport(seen).checks.find((item) => item.id === 'robots');
  assert.equal(finding.status, 'problem'); assert.match(finding.detail, /noindex/);
});
test('a readable contract must contain actionable structure, not a bare marketing name', async () => {
  const { protocolValidity } = await import('../../lib/free-check-v2/probe.js');
  assert.equal(protocolValidity('openapi', response('{"openapi":"3.1.0","paths":{}}')), false);
  assert.equal(protocolValidity('a2a', response('{"name":"Marketing"}')), false);
  assert.equal(protocolValidity('openapi', response('{"openapi":"3.1.0","paths":{"/read":{"get":{"responses":{"200":{}}}}}}')), true);
});
test('intentional training-only user-agent refusals do not deduct search access points', () => {
  const seen = observation(); seen.bots = [{ agent: 'GPTBot', status: 403 }, { agent: 'OAI-SearchBot', status: 200 }];
  assert.equal(evaluateReport(seen).checks.find((item) => item.id === 'bot-fetches').status, 'pass');
});

test('an MCP endpoint named in the site guide is not reported as missing', () => {
  const seen = observation();
  seen.probes.mcp = response('not found', { status: 404, ok: false, valid: false, declared: 'https://business.example/mcp' });
  const mcp = evaluateReport(seen).checks.find((finding) => finding.id === 'mcp');
  assert.equal(mcp.status, 'unknown'); assert.match(mcp.detail, /business\.example\/mcp/); assert.equal(mcp.offer, null);
});
test('controls hidden from assistive technology need no label; title and placeholder name a control', () => {
  const doc = analyzeDocument('<body><input aria-hidden="true" tabindex="-1"><div hidden><select></select></div><input type="checkbox" class="hidden" aria-hidden="true"><input type="email" placeholder="Email"><input title="Search"><input name="bare"></body>', url);
  assert.equal(doc.controls, 3); assert.deepEqual(doc.missingLabels, [{ tag: 'input', name: 'bare' }]);
});
test('initial-scale=1 counts as a mobile viewport; a refused crawler-name request stays unverified', () => {
  const seen = observation(html.replace('width=device-width, initial-scale=1', 'initial-scale=1,user-scalable=yes'));
  seen.bots = [{ agent: 'Googlebot', status: 403, challenge: true }, { agent: 'OAI-SearchBot', status: 200 }];
  const report = evaluateReport(seen);
  assert.equal(report.checks.find((finding) => finding.id === 'viewport').status, 'pass');
  assert.equal(report.checks.find((finding) => finding.id === 'bot-fetches').status, 'unknown');
});
test('robots.txt follows a redirect to another host and an oversized file is still read', async () => {
  const moved = Object.assign(Error('Redirect left the site origin'), { code: 'off_origin_redirect', location: 'https://en.business.example/robots.txt' });
  const big = `User-agent: OAI-SearchBot\nDisallow: /\n# ${'x'.repeat(600_000)}`;
  const fetcher = (robots) => async (target, options) => target === 'https://business.example/robots.txt' ? (() => { throw moved; })()
    : target.endsWith('/robots.txt') ? response(robots, { finalUrl: target, contentType: 'text/plain', oversize: robots.length > options.maxBytes, body: robots.slice(0, options.maxBytes) })
    : response(html, { finalUrl: target });
  const report = await runFreeCheck(url, { fetcher: fetcher(big), cruxKey: null });
  assert.equal(report.policies.find((policy) => policy.agent === 'OAI-SearchBot').allowed, false);
  assert.equal(report.checks.find((finding) => finding.id === 'robots').status, 'problem');
  assert.ok(report.requests.some((request) => request.url === 'https://business.example/robots.txt'));
});
test('a report leads with Problems in site wording, three fixes with points and one offer', () => {
  const report = evaluateReport(observation(html.replace('Buy this service for 99 USD. ', '')));
  const purchase = report.checks.find((finding) => finding.id === 'purchase');
  assert.equal(purchase.status, 'problem'); assert.match(purchase.detail, /Useful/); assert.match(purchase.detail, /no price/);
  assert.equal(report.checks.find((finding) => finding.id === 'mcp').status, 'unknown');
  assert.equal(report.summary.topFixes.length, 3); assert.equal(report.summary.topFixes[0].id, 'purchase');
  assert.equal(report.summary.offer, 'agent_front_door');
  for (const finding of report.checks) assert.doesNotMatch(`${finding.detail} ${finding.fix || ''}`, /if suitable|only if|where appropriate|where useful|\b1 points\b|[–—]/);
});
test('the CrUX key is sent in a header, never in the URL', async () => {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (target, init) => { seen.push({ target: String(target), key: init.headers['x-goog-api-key'] }); return { ok: true, json: async () => ({ record: { collectionPeriod: {}, metrics: { largest_contentful_paint: { percentiles: { p75: 2100 } }, cumulative_layout_shift: { percentiles: { p75: '0.02' } }, interaction_to_next_paint: { percentiles: { p75: 150 } } } } }) }; };
  try {
    const report = await runFreeCheck(url, { fetcher: async (target) => response(html, { finalUrl: target }), cruxKey: 'test-key-value' });
    assert.equal(report.checks.find((finding) => finding.id === 'crux').status, 'pass');
    assert.equal(seen.length, 1); assert.equal(seen[0].target.includes('test-key-value'), false); assert.equal(seen[0].key, 'test-key-value');
  } finally { globalThis.fetch = original; }
});


test('missing structured data is named separately from malformed JSON-LD syntax', () => {
  const missing = observation(html.replace(/<script type="application\/ld\+json">.*?<\/script>/, ''));
  const absent = evaluateReport(missing).checks.find((item) => item.id === 'jsonld');
  assert.equal(absent.status, 'problem'); assert.equal(absent.label, 'Structured data');
  assert.match(absent.detail, /no structured data/); assert.match(absent.fix, /Add a JSON-LD block/);
  const malformed = evaluateReport(observation(html.replace('"@type":"Organization"', 'BROKEN'))).checks.find((item) => item.id === 'jsonld');
  assert.equal(malformed.status, 'problem'); assert.equal(malformed.label, 'JSON-LD syntax');
  assert.match(malformed.detail, /not parse/); assert.match(malformed.fix, /Fix the JSON syntax/);
  assert.equal(evaluateReport(observation()).checks.find((item) => item.id === 'jsonld').status, 'pass');
});

test('the suggested starting-price example stays neutral when the site declares no price', () => {
  const report = evaluateReport(observation(html.replace('Buy this service for 99 USD. ', '')));
  const purchase = report.checks.find((item) => item.id === 'purchase');
  assert.equal(purchase.status, 'problem');
  assert.match(purchase.fix, /from X USD a month/); assert.doesNotMatch(purchase.fix, /20 USD/);
  assert.match(report.summary.topFixes.find((item) => item.id === 'purchase').fix, /from X USD a month/);
});
