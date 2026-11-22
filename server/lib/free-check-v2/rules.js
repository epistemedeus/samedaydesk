import { createHash } from 'node:crypto';
import { excerpt } from './facts.js';

// Freeze weights before calibration. Absent optional capabilities are upgrades,
// inaccessible or unmeasured capabilities are unknown, never invented failures.
export const RULE_VERSION = '2.0.0';
export const RULES = [
  ['https', 'access', 2, 'HTTPS'], ['redirects', 'access', 1, 'Redirect chain'],
  ['latency', 'access', 2, 'Initial response time'], ['fetch', 'access', 3, 'Public page fetch'],
  ['robots', 'access', 3, 'AI search crawler policy'], ['bot-fetches', 'access', 3, 'Crawler user-agent requests'],
  ['html', 'access', 4, 'Text without JavaScript'], ['rendered', 'access', 2, 'Rendered text comparison'],
  ['title', 'understanding', 2, 'Page title'], ['description', 'understanding', 2, 'Page description'],
  ['headings', 'understanding', 2, 'Heading structure'], ['canonical', 'understanding', 2, 'Canonical URL'],
  ['language', 'understanding', 1, 'Page language'], ['jsonld', 'understanding', 2, 'JSON-LD syntax'],
  ['entity', 'understanding', 2, 'Business identity'], ['offers', 'understanding', 3, 'Machine-readable offer'],
  ['identity', 'understanding', 1, 'Identity consistency'], ['about', 'understanding', 1, 'About page'],
  ['contact', 'understanding', 2, 'Contact route'], ['pricing', 'understanding', 2, 'Pricing or services page'],
  ['freshness', 'understanding', 1, 'Dated facts'], ['images', 'understanding', 1, 'Image descriptions'],
  ['markdown', 'understanding', 1, 'Text alternate'], ['llms', 'understanding', 3, 'Machine guide quality'],
  ['sitemap', 'understanding', 2, 'Sitemap discovery'],
  ['what', 'answers', 4, 'Opening description'], ['who', 'answers', 3, 'Audience in opening copy'],
  ['purchase', 'answers', 6, 'Price and next action'], ['faq', 'answers', 2, 'Buyer questions'],
  ['forms', 'actions', 3, 'Form labels'], ['public-action', 'actions', 4, 'Public purchase or booking route'],
  ['wallets', 'actions', 2, 'Wallet or Link declaration'], ['mcp', 'actions', 4, 'MCP discovery'],
  ['a2a', 'actions', 2, 'Agent card'], ['openapi', 'actions', 3, 'OpenAPI contract'],
  ['feeds', 'actions', 3, 'Agent checkout feed'], ['payment', 'actions', 3, 'Payment protocol declaration'],
  ['webmcp', 'actions', 1, 'WebMCP declaration'],
  ['crux', 'speed-mobile', 7, 'Field Core Web Vitals'], ['viewport', 'speed-mobile', 3, 'Mobile viewport'],
].map(([id, group, weight, label]) => Object.freeze({ id, group, weight, label }));
export const RULE_SHA256 = createHash('sha256').update(JSON.stringify(RULES)).digest('hex');
const fixFor = {
  access: ['Make useful public content retrievable without a challenge. Review crawler rules without changing intentional training opt-outs.', 'agent_front_door'],
  understanding: ['Expose the observed missing fact in the page or its machine-readable description.', 'agent_front_door'],
  answers: ['State the answer next to the relevant service and next action.', null],
  actions: ['Publish a documented action for the existing service, with its inputs and result.', 'agent_mcp_server'],
  'speed-mobile': ['Use the measured mobile or field result to prioritize the repair.', null],
};
export function evaluateReport(observation) {
  const { page, document: doc, probes = {}, bots = [], policies = [], timingMs = 0 } = observation;
  const source = page?.finalUrl || observation.url;
  const result = [];
  const add = (id, status, detail, evidence = [], extra = {}) => {
    const rule = RULES.find((rule) => rule.id === id);
    if (!rule || result.some((item) => item.id === id)) throw Error('Invalid rule result');
    if (status !== 'unknown' && !evidence.length) throw Error(`Evidence required for ${id}`);
    result.push({ ...rule, status, detail, evidence: evidence.map((item) => ({ url: source, ...item })),
      impact: rule.weight >= 3 ? 'high' : 'medium', effort: rule.group === 'actions' ? 'build' : 'small',
      fix: status === 'pass' || status === 'unknown' ? null : fixFor[rule.group][0],
      offer: status === 'pass' || status === 'unknown' ? null : fixFor[rule.group][1], ...extra });
  };
  const ev = (kind, value, url = source) => [{ kind, value: excerpt(value, 300), url }];
  const unknown = (id, message = 'This run did not verify this measurement.') => add(id, 'unknown', message);
  const optional = (id, present, good, absent, evidence, extra) => add(id, present ? 'pass' : 'upgrade', present ? good : absent, evidence, extra);
  add('https', source.startsWith('https:') ? 'pass' : 'problem', source.startsWith('https:') ? 'The checked page uses HTTPS.' : 'The checked page uses unencrypted HTTP.', ev('url', source));
  if (page?.status) {
    add('redirects', page.redirects.length > 2 ? 'problem' : 'pass', `${page.redirects.length} redirects before the checked page.`, ev('redirects', JSON.stringify(page.redirects)));
    add('latency', timingMs > 2000 ? 'problem' : 'pass', `Initial fetch took ${Math.round(timingMs)} ms from this checker. This is not a user field measurement.`, ev('timing-ms', timingMs));
    add('fetch', page.ok && !page.challenge && !page.oversize ? 'pass' : 'problem', `Public fetch returned HTTP ${page.status}${page.challenge ? ' with a challenge page' : ''}${page.oversize ? '; body exceeded the bounded read' : ''}.`, ev('http-status', page.status));
  } else for (const id of ['redirects', 'latency', 'fetch']) unknown(id, 'The public page could not be measured. See retrieval evidence.');
  const search = policies.filter((policy) => policy.purpose === 'search');
  if (!search.length || search.some((policy) => policy.allowed === null)) unknown('robots', 'Crawler policy could not be read reliably. Training controls are reported separately.');
  else {
    const noindex = /(?:^|[,;\s])noindex(?:$|[,;\s])/i.test(`${page?.headers?.['x-robots-tag'] || ''} ${doc?.robots || ''}`);
    const policyEvidence = ev('robots-policy', search.map((policy) => `${policy.agent}: ${policy.allowed ? 'allowed' : 'disallowed'}`).join(';'), observation.robotsUrl);
    if (noindex) policyEvidence.push(...ev('noindex-directive', `${page?.headers?.['x-robots-tag'] || ''} ${doc?.robots || ''}`));
    add('robots', search.some((policy) => !policy.allowed) || noindex ? 'problem' : 'pass', noindex ? 'A noindex directive is present. Confirm that excluding this page from search is intended.' : search.some((policy) => !policy.allowed) ? 'At least one search crawler is disallowed on the checked URL. Confirm that this is intended.' : 'The inspected robots rules allow the checked path for these search crawlers.', policyEvidence);
  }
  const searchRequests = bots.filter((bot) => ['OAI-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot', 'ChatGPT-User', 'Claude-User'].includes(bot.agent));
  // These requests carry a crawler's name from this checker's address. Sites that verify crawlers
  // by address (bot management, Wikimedia) rightly refuse them, so a refusal says nothing about the
  // real crawler: it stays Not verified. robots.txt above is the declared policy.
  const botEvidence = ev('user-agent-http', bots.map((bot) => `${bot.agent}: ${bot.status}${bot.challenge ? ' challenge' : ''}`).join(';'));
  if (searchRequests.length && searchRequests.every((bot) => bot.status >= 200 && bot.status < 400 && !bot.challenge)) add('bot-fetches', 'pass', 'Requests carrying search crawler user-agent strings received the page. They came from this checker, not provider addresses, and are not indexing proof.', botEvidence);
  else unknown('bot-fetches', searchRequests.some((bot) => bot.status >= 400 || bot.challenge) ? 'A request carrying a crawler name from this checker\'s address was refused or challenged. Sites that verify crawlers by address do this correctly, so it does not show that the real crawler is refused. See the robots policy for what the site declares.' : 'One or more crawler user-agent requests did not finish. No provider crawler or index state is inferred.');
  if (!doc) {
    if (probes.payment?.status === 402) add('payment', probes.payment.valid ? 'pass' : 'problem', probes.payment.valid ? 'The actual unpaid x402 challenge passes the maintained network-aware parser. No payment was made.' : probes.payment.error, ev('payment-challenge', probes.payment.error || probes.payment.networks.join(';')));
    for (const rule of RULES) if (!result.some((item) => item.id === rule.id)) unknown(rule.id, 'The page body was not available for this check.');
    return finish(result, observation, Boolean(probes.payment?.valid));
  }
  add('html', doc.words >= 80 ? 'pass' : 'problem', `${doc.words} words are present in the initial HTML after scripts, styles and hidden content are excluded.`, ev('initial-text', doc.visible));
  if (observation.rendered) add('rendered', observation.rendered.extraWords > 100 && doc.words < 80 ? 'problem' : 'pass', `${observation.rendered.words} rendered words compared with ${doc.words} in initial HTML.`, ev('rendered-text', JSON.stringify(observation.rendered)));
  else unknown('rendered', 'No browser rendering was available in this run. Initial HTML is checked separately.');
  optional('title', Boolean(doc.title), `Title: ${doc.title}`, 'Add a useful title for this page.', ev('title', doc.title || 'No title element in initial HTML.'));
  optional('description', Boolean(doc.description), 'A page description is present.', 'Add a concise description of the service.', ev('meta-description', doc.description || 'No description meta element in initial HTML.'));
  const h1 = doc.headings.filter((heading) => heading.level === 1);
  const jumps = doc.headings.some((heading, index) => index && heading.level > doc.headings[index - 1].level + 1);
  add('headings', h1.length === 1 && !jumps ? 'pass' : 'upgrade', `${h1.length} primary headings; ${jumps ? 'a heading level is skipped' : 'no skipped heading levels'}.`, ev('headings', doc.headings.map((heading) => `${heading.level}: ${heading.value}`).join(';')));
  optional('canonical', Boolean(doc.canonical), 'A canonical URL is declared. Google selection is not inspected by this check.', 'Declare the preferred URL if this page has equivalent alternatives.', ev('canonical', doc.canonical || 'No canonical link in initial HTML.'));
  optional('language', Boolean(doc.language), 'The document declares its language.', 'Declare the document language.', ev('html-lang', doc.language || 'No lang attribute on html.'));
  add('jsonld', doc.invalidSchemas.length ? 'problem' : doc.schemas.length ? 'pass' : 'upgrade', doc.invalidSchemas.length ? `${doc.invalidSchemas.length} JSON-LD blocks did not parse.` : doc.schemas.length ? 'JSON-LD parses as JSON. Type applicability is checked separately; this is not a rich-result eligibility test.' : 'No JSON-LD was found. Use types that fit this business rather than adding unrelated FAQ or rating data.', ev('jsonld', doc.invalidSchemas.join(';') || doc.schemaTypes.join(', ') || 'No application/ld+json block.'));
  optional('entity', doc.entities.some((entity) => entity.name && (entity.url || entity.sameAs)), 'A named business entity has a URL or sameAs reference.', 'Describe the existing business with its name and a stable identity reference.', ev('entity', doc.entities.map((entity) => `${entity.name || '(unnamed)'}; URL ${Boolean(entity.url)}; sameAs ${Boolean(entity.sameAs)}`).join(';') || 'No matching organization or local-business entity.'));
  optional('offers', doc.offers.length, `${doc.offers.length} structured offers contain a price. Currency and applicability still need the publisher's review.`, 'If prices are public, connect the actual product or service to an Offer and currency.', ev('offer', doc.offers.map((offer) => JSON.stringify({ price: offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price, currency: offer.priceCurrency ?? offer.priceSpecification?.priceCurrency })).join(';') || 'No structured Offer with a price.'));
  if (observation.identity) add('identity', observation.identity.consistent ? 'pass' : 'problem', observation.identity.detail, observation.identity.evidence);
  else unknown('identity', 'A matching name, address and phone could not be verified across two pages. Missing values are not treated as contradictions.');
  for (const key of ['about', 'contact', 'pricing']) {
    const probe = probes[key];
    if (!probe) optional(key, false, '', `No ${key} page was linked from the inspected HTML. Add one if it serves this business.`, ev('navigation', `No ${key} link discovered.`));
    else if (!probe.status) unknown(key, `The linked ${key} page did not finish loading.`);
    else add(key, probe.ok && !probe.challenge ? 'pass' : 'problem', `Linked ${key} page returned HTTP ${probe.status}.`, ev('http-status', probe.status, probe.finalUrl));
  }
  optional('freshness', doc.dates.length, 'The page exposes a parseable publication or modification date.', 'Date facts that can become stale when the date helps a buyer.', ev('dates', doc.dates.join(';') || 'No parseable time or structured publication/modification date.'));
  const missingAlt = doc.images.filter((image) => image.alt === null);
  add('images', missingAlt.length ? 'upgrade' : 'pass', `${missingAlt.length} of ${doc.images.length} images lack an alt attribute. Empty alt can be correct for decoration; image meaning was not inferred.`, ev('image-alt', missingAlt.map((image) => image.src || '(inline image)').join(';') || 'All inspected img elements have an alt attribute.'));
  const md = probes.markdown;
  if (md && !md.status) unknown('markdown', 'The declared text alternate did not finish loading.');
  else optional('markdown', md?.ok && /text\/(plain|markdown)/i.test(md.contentType), 'The declared text alternate is retrievable.', 'Offer a useful text alternate when it helps this service.', ev('text-alternate', md ? `HTTP ${md.status}; ${md.contentType}` : 'No text alternate declared in the page.', md?.finalUrl || source));
  const llms = probes.llms;
  if (!llms?.status) unknown('llms', 'The machine guide could not be checked.');
  else optional('llms', llms.guideValid, 'The machine guide has sections and checked links. This does not guarantee citations.', 'Provide a concise guide with working links if agents need a map of this service.', ev('llms', `HTTP ${llms.status}; ${llms.bytes || 0} bytes; ${llms.sections || 0} sections; ${llms.linkChecks?.length || 0} links checked. ${llms.linkChecks?.map((link) => `${link.url}: ${link.status || 'unmeasured'}`).join(';') || ''}`, llms.finalUrl));
  const sitemap = probes.sitemap;
  if (!sitemap?.status) unknown('sitemap', 'Sitemap retrieval did not finish.');
  else optional('sitemap', sitemap.ok && /<urlset\b|<sitemapindex\b/i.test(sitemap.body), 'An XML sitemap is retrievable. Submission and indexing are not inspected.', 'Publish a sitemap of canonical pages that should be discovered.', ev('sitemap', `HTTP ${sitemap.status}; XML sitemap ${Boolean(/<urlset\b|<sitemapindex\b/i.test(sitemap.body))}`, sitemap.finalUrl));
  optional('what', doc.headings.some((heading) => heading.level === 1 && heading.value.length > 12) && doc.opening.length > 150, 'The initial copy contains a primary heading and supporting text. A human should confirm the answer is clear.', 'Explain the service in the opening copy.', ev('opening-copy', doc.opening));
  optional('who', /\b(for (?:your|you|teams|businesses|developers|people|companies|agents|founders|customers)|built for|designed for|help(?:s|ing)? (?:you|teams|businesses))\b/i.test(doc.opening), 'Opening copy contains an explicit audience phrase.', 'Name the intended buyer in the opening copy if it is unclear.', ev('opening-copy', doc.opening));
  const actionLink = doc.links.find((link) => /buy|book|order|start|quote|contact|try|shop/i.test(link.label));
  optional('purchase', Boolean(doc.priceText && actionLink), 'A price and labelled next-action link are readable in initial HTML. Checkout totals and first-screen position were not exercised.', 'Expose a public price, range or quote route next to a clear action where appropriate.', [...ev('price-text', doc.priceText || 'No supported price pattern in initial page text.'), ...ev('action-link', actionLink ? `${actionLink.label}: ${actionLink.url}` : 'No matching next-action link.')]);
  const questions = doc.faq.filter((item) => item.name).map((item) => String(item.name)).concat(doc.headings.filter((heading) => /[?？]/.test(heading.value)).map((heading) => heading.value));
  optional('faq', questions.length >= 2, `${questions.length} explicit questions are readable or declared. Their answers need publisher review for correctness.`, 'Answer the questions buyers actually ask about price, timing, delivery and support, where useful.', ev('buyer-questions', questions.join('; ') || 'No explicit buyer-question headings or structured Question names were found.'));
  if (!doc.controls) add('forms', 'unknown', 'There are no visible form controls in the initial HTML. JavaScript-created controls and the accessibility tree were not inspected.', []);
  else add('forms', doc.missingLabels.length ? 'problem' : 'pass', `${doc.missingLabels.length} of ${doc.controls} initial-HTML controls lack an associated label. Full browser accessibility behavior is not inferred.`, ev('form-labels', JSON.stringify(doc.missingLabels)));
  const action = probes.action;
  if (!action?.status) unknown('public-action', 'No public action destination was verified. A button or marketing claim alone does not earn action points.');
  else add('public-action', action.ok && !action.loginWall ? 'pass' : 'upgrade', `Read-only HEAD returned HTTP ${action.status}${action.loginWall ? ' at a sign-in route' : ''}. No booking, order, login or payment was attempted.`, ev('action-head', `HTTP ${action.status}; ${action.finalUrl}`, action.finalUrl));
  const wallet = /\b(?:apple pay|google pay|stripe link|pay with link)\b/i.exec(doc.visible);
  optional('wallets', Boolean(wallet), 'The page declares a wallet or Link option; payment availability is not tested.', 'If suitable, expose the payment methods your actual checkout supports.', ev('wallet-declaration', wallet?.[0] || 'No named wallet or Link option in initial page text.'), { offer: wallet ? null : 'machine_payment_route' });
  for (const id of ['mcp', 'a2a', 'openapi', 'feeds']) {
    const probe = probes[id];
    if (!probe?.status) unknown(id, 'Discovery did not complete. No capability is inferred.');
    else if (id === 'mcp' && !probe.valid && probe.declared) add(id, 'unknown', `The site names an MCP endpoint at ${probe.declared} but publishes no server description at the discovery path. This read-only check does not call the endpoint.`, ev('declared-endpoint', probe.declared, probe.finalUrl));
    else optional(id, Boolean(probe.valid), 'A readable discovery document is present; authenticated execution and paid actions were not called.', 'Publish a maintained contract only if this service has a useful action for agents.', ev('discovery', `HTTP ${probe.status}; recognized structure ${Boolean(probe.valid)}`, probe.finalUrl), { offer: probe.valid ? null : id === 'feeds' ? 'agent_storefront' : 'agent_mcp_server' });
  }
  const payment = probes.payment;
  if (payment?.status === 402) add('payment', payment.valid ? 'pass' : payment.error ? 'problem' : 'unknown', payment.valid ? 'The observed unpaid x402 challenge passes the maintained network-aware parser. No payment or delivery was attempted.' : payment.error || 'A payment challenge was observed but not verified.', ev('payment-challenge', payment.error || payment.networks?.join(';') || 'HTTP 402'), { offer: payment.valid ? null : 'machine_payment_route' });
  else optional('payment', Boolean(payment?.documented), 'A readable payment protocol contract is present. Live settlement and delivery are not verified.', 'Document an existing agent payment route if it serves this business.', ev('payment-discovery', `HTTP ${payment?.status || 'unmeasured'}; documented ${Boolean(payment?.documented)}`), { offer: payment?.documented ? null : 'machine_payment_route' });
  optional('webmcp', doc.webmcpDeclared, 'The HTML declares WebMCP integration. Tool availability was not invoked.', 'Consider browser tools if a repeated customer task would benefit.', ev('webmcp-declaration', doc.webmcpDeclared ? 'modelContext or toolname declaration in initial HTML.' : 'No WebMCP declaration in initial HTML.'));
  if (observation.crux?.metrics) add('crux', observation.crux.good ? 'pass' : 'problem', 'Origin field data from CrUX is reported with its collection period. It is not this page or a lab run.', ev('crux-field', JSON.stringify(observation.crux)));
  else unknown('crux', observation.crux?.reason || 'CrUX field data was unavailable. No field or Lighthouse result is inferred.');
  add('viewport', /width\s*=\s*device-width|initial-scale\s*=\s*1(?:\.0*)?(?![\d.])/i.test(doc.viewport || '') ? 'pass' : 'problem', doc.viewport ? 'The initial document viewport was inspected. Layout fit requires browser review.' : 'No mobile viewport meta element was found.', ev('viewport', doc.viewport || 'No viewport meta element.'));
  const verifiedAction = Boolean(action?.ok && !action.loginWall && doc.controls && !doc.missingLabels.length) || ['mcp', 'a2a', 'openapi', 'feeds'].some((id) => probes[id]?.valid) || Boolean(payment?.valid);
  return finish(result, observation, verifiedAction);
}
function finish(checks, observation, verifiedAction) {
  const earned = checks.reduce((sum, item) => sum + (item.status === 'pass' ? item.weight : 0), 0);
  const unknown = checks.reduce((sum, item) => sum + (item.status === 'unknown' ? item.weight : 0), 0);
  const cap = verifiedAction ? 100 : 75;
  const score = Math.min(cap, earned);
  return { version: 2, ruleVersion: RULE_VERSION, ruleSha256: RULE_SHA256,
    url: observation.url, checkedAt: new Date().toISOString(), score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    scoring: { earned, unknown, maximum: 100, cap, verifiedAction, possibleWithUnknowns: Math.min(cap, earned + unknown), meaning: 'Verified points for this public read-only check. Unknown checks earn no points and are not failures.' },
    groups: [...new Set(RULES.map((rule) => rule.group))].map((group) => ({ group, maximum: RULES.filter((rule) => rule.group === group).reduce((sum, rule) => sum + rule.weight, 0), earned: checks.filter((rule) => rule.group === group && rule.status === 'pass').reduce((sum, rule) => sum + rule.weight, 0) })),
    summary: { wordsOnHomepage: observation.document?.words || 0, lang: observation.document?.language || null, canonical: observation.document?.canonical || null, h1: observation.document?.headings.find((heading) => heading.level === 1)?.value || null },
    checks, policies: observation.policies || [], requests: observation.requests || [],
    limitations: ['User-agent requests do not prove access from provider IP ranges or Google indexing.', 'This check never submits a form, signs in, invokes a tool or makes a payment.', 'Optional integrations are upgrades, not claims that every business needs every protocol.'],
  };
}
