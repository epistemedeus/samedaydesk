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
  const report = await runFreeCheck('https://business.example/public/', { fetcher: async (target, options) => target.endsWith('/robots.txt') ? response(robots, { finalUrl: target, contentType: 'text/plain' }) : options.userAgent ? response() : target.endsWith('/public/') ? response() : response('', { status: 404, ok: false, finalUrl: target }), cruxKey: null });
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
