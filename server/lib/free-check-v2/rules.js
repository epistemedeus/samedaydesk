import { createHash } from 'node:crypto';
import { excerpt } from './facts.js';

// Weights were frozen before calibration. A Problem loses points on reading, understanding or
// answering and this business can fix it; an Upgrade is a new agent capability; what this run
// could not measure is unknown, never an invented failure. Every deduction cites its evidence.
export const RULE_VERSION = '2.1.0';
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
// New agent capabilities, and the two nice-to-haves nearly every site lacks, are Upgrades.
const UPGRADES = new Set(['mcp', 'a2a', 'openapi', 'feeds', 'payment', 'webmcp', 'wallets', 'markdown', 'freshness']);
const OFFER = { mcp: 'agent_mcp_server', a2a: 'agent_mcp_server', openapi: 'agent_mcp_server', webmcp: 'agent_mcp_server', feeds: 'agent_storefront', payment: 'machine_payment_route', wallets: 'machine_payment_route' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// The name a buyer would type into an assistant: the declared organization, the site name, the
// shortest title segment, or the host.
function siteName(doc, source) {
  const host = new URL(source).hostname.replace(/^www\./, '');
  const named = doc?.entities?.find((entity) => typeof entity.name === 'string' && entity.name.trim())?.name;
  if (doc?.siteName && doc.siteName.length <= 40) return doc.siteName;
  const short = named?.trim().replace(/,?\s+(?:Inc|LLC|Ltd|GmbH|Corp|Co|PBC|S\.?A|B\.?V)\.?$/i, '');
  if (short && short.length <= 40) return short;
  const parts = String(doc?.title || '').split(/\s[|\u2013\u2014:\u00b7-]\s/).map((part) => part.trim()).filter((part) => part && part.length <= 30);
  const brand = parts.find((part) => host.split('.')[0].toLowerCase().includes(part.toLowerCase().replace(/[^a-z0-9]/g, '')) && part.replace(/[^a-z0-9]/gi, '').length >= 2);
  return brand || host;
}
export function evaluateReport(observation) {
  const { page, document: doc, probes = {}, bots = [], policies = [], timingMs = 0 } = observation;
  const source = page?.finalUrl || observation.url;
  const name = siteName(doc, source);
  const result = [];
  // add(id, status, detail, evidence, { fix, offer }): detail says what was observed on this site and
  // what it costs; fix is one concrete change.
  const add = (id, status, detail, evidence = [], extra = {}) => {
    const rule = RULES.find((rule) => rule.id === id);
    if (!rule || result.some((item) => item.id === id)) throw Error('Invalid rule result');
    if (status !== 'unknown' && !evidence.length) throw Error(`Evidence required for ${id}`);
    const open = status === 'problem' || status === 'upgrade';
    result.push({ ...rule, status, detail, evidence: evidence.map((item) => ({ url: source, ...item })),
      impact: rule.weight >= 3 ? 'high' : 'medium', effort: rule.group === 'actions' ? 'build' : 'small',
      ...extra, fix: open ? extra.fix ?? null : null, offer: open ? extra.offer ?? OFFER[id] ?? 'agent_front_door' : null });
  };
  // A gap is a Problem unless the rule is an Upgrade.
  const gap = (id, ok, good, detail, fix, evidence, extra = {}) => add(id, ok ? 'pass' : UPGRADES.has(id) ? 'upgrade' : 'problem', ok ? good : detail, evidence, { ...extra, fix });
  const ev = (kind, value, url = source) => [{ kind, value: excerpt(value, 300), url }];
  const unknown = (id, message = 'This run did not measure this.') => add(id, 'unknown', message);
  const https = source.startsWith('https:');
  add('https', https ? 'pass' : 'problem', https ? 'The page is served over HTTPS.' : `${name} serves this page over plain HTTP, so browsers flag it as not secure and some assistants skip it.`, ev('url', source), { fix: 'Serve the site over HTTPS and redirect HTTP to it.' });
  if (page?.status) {
    const hops = page.redirects.length;
    add('redirects', hops > 2 ? 'problem' : 'pass', hops > 2 ? `Reaching this page took ${hops} redirects. Each hop costs crawlers time and some stop early.` : `${plural(hops, 'redirect')} before the page.`, ev('redirects', JSON.stringify(page.redirects)), { fix: 'Link and redirect straight to the final address in one hop.' });
    const ms = Math.round(timingMs);
    add('latency', timingMs > 2000 ? 'problem' : 'pass', timingMs > 2000 ? `The first response took ${ms} ms. Assistants fetching on a buyer's behalf give up on slow pages.` : `The first response took ${ms} ms from this checker.`, ev('timing-ms', timingMs), { fix: 'Cache the homepage at the edge so the first byte arrives in well under a second.' });
    const ok = page.ok && !page.challenge && !page.oversize;
    add('fetch', ok ? 'pass' : 'problem', ok ? `The page answered HTTP ${page.status}.` : `An ordinary request for ${source} got HTTP ${page.status}${page.challenge ? ' and a bot challenge' : ''}${page.oversize ? ' and a page too large to read' : ''}. An assistant reading the page for a buyer sees the same wall, not ${name}.`, ev('http-status', page.status), { fix: page.challenge ? 'Let ordinary reads of public pages through the bot check; challenge only logins and checkouts.' : 'Serve the public homepage to an ordinary request.' });
  } else for (const id of ['redirects', 'latency', 'fetch']) unknown(id, 'The page could not be reached from this checker.');
  const search = policies.filter((policy) => policy.purpose === 'search');
  if (!search.length || search.some((policy) => policy.allowed === null)) unknown('robots', 'robots.txt could not be read.');
  else {
    const directive = `${page?.headers?.['x-robots-tag'] || ''} ${doc?.robots || ''}`;
    const noindex = /(?:^|[,;\s])noindex(?:$|[,;\s])/i.test(directive);
    const blocked = search.filter((policy) => !policy.allowed).map((policy) => policy.agent);
    const policyEvidence = ev('robots-policy', search.map((policy) => `${policy.agent}: ${policy.allowed ? 'allowed' : 'disallowed'}`).join('; '), observation.robotsUrl);
    if (noindex) policyEvidence.push(...ev('noindex-directive', directive));
    add('robots', noindex || blocked.length ? 'problem' : 'pass', noindex ? `This page tells search engines not to index it (noindex), so AI search cannot cite it.` : blocked.length ? `robots.txt blocks ${blocked.join(', ')} from this page, so ${blocked.length === 1 ? 'that search engine' : 'those search engines'} cannot show ${name} in AI answers.` : 'robots.txt lets the AI search crawlers read this page.', policyEvidence, { fix: noindex ? 'Remove noindex from pages you want found.' : `Allow ${blocked.join(', ')} in robots.txt. Training crawlers can stay blocked.` });
  }
  const searchRequests = bots.filter((bot) => ['OAI-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot', 'ChatGPT-User', 'Claude-User'].includes(bot.agent));
  // These requests carry a crawler's name from this checker's address. Sites that verify crawlers by
  // address rightly refuse them, so a refusal says nothing about the real crawler: Not verified.
  const botEvidence = ev('user-agent-http', bots.map((bot) => `${bot.agent}: ${bot.status}${bot.challenge ? ' challenge' : ''}`).join('; '));
  if (searchRequests.length && searchRequests.every((bot) => bot.status >= 200 && bot.status < 400 && !bot.challenge)) add('bot-fetches', 'pass', 'Requests named as the AI search crawlers received the page.', botEvidence);
  else unknown('bot-fetches', searchRequests.some((bot) => bot.status >= 400 || bot.challenge) ? 'crawler access (a request named as a crawler was refused, which sites that verify crawlers by address do correctly)' : 'crawler access');
  if (!doc) {
    if (probes.payment?.status === 402) add('payment', probes.payment.valid ? 'pass' : 'problem', probes.payment.valid ? 'The unpaid x402 challenge parses for its declared networks. No payment was made.' : `The x402 payment challenge does not parse: ${probes.payment.error}. Agents cannot pay it.`, ev('payment-challenge', probes.payment.error || probes.payment.networks.join('; ')), { fix: 'Return a valid x402 challenge with a supported network and payee.' });
    for (const rule of RULES) if (!result.some((item) => item.id === rule.id)) unknown(rule.id, 'The page body was not available.');
    return finish(result, observation, Boolean(probes.payment?.valid), name);
  }
  add('html', doc.words >= 80 ? 'pass' : 'problem', doc.words >= 80 ? `${doc.words} words are readable without JavaScript.` : `Without JavaScript the page has ${plural(doc.words, 'word')}. Most AI crawlers do not run scripts, so they see an almost empty ${name}.`, ev('initial-text', doc.visible), { fix: 'Render the headline, the description of the service and the price into the HTML on the server.' });
  if (observation.rendered) add('rendered', observation.rendered.extraWords > 100 && doc.words < 80 ? 'problem' : 'pass', `${observation.rendered.words} words after scripts run, ${doc.words} before.`, ev('rendered-text', JSON.stringify(observation.rendered)), { fix: 'Put the text that scripts add into the server HTML.' });
  else unknown('rendered', 'rendered text');
  gap('title', Boolean(doc.title), `Title: ${doc.title}`, `The page has no title, so an assistant has no name to show when it links to ${name}.`, `Add a title such as "${name}: what you do, for whom".`, ev('title', doc.title || 'No title element.'));
  gap('description', Boolean(doc.description), `Description: ${excerpt(doc.description, 120)}`, `There is no meta description, so search and AI snippets summarize ${name} from whatever text they find first, often the menu.`, `Add a one-sentence description of what ${name} sells and to whom.`, ev('meta-description', doc.description || 'No description meta element.'));
  const h1 = doc.headings.filter((heading) => heading.level === 1);
  const jumps = doc.headings.some((heading, index) => index && heading.level > doc.headings[index - 1].level + 1);
  gap('headings', h1.length === 1 && !jumps, `One main heading: ${h1[0]?.value}`, h1.length === 0 ? `The page has no main heading (h1), so an assistant has to guess which line says what ${name} is.` : h1.length > 1 ? `The page has ${h1.length} main headings (h1), so an assistant cannot tell which one says what ${name} is.` : 'Heading levels skip a step, which blurs which section belongs to which topic.', h1.length === 1 ? 'Nest headings in order (h2 under h1, h3 under h2).' : 'Keep one h1 that states the offer; make the others h2.', ev('headings', doc.headings.map((heading) => `${heading.level}: ${heading.value}`).join('; ')));
  gap('canonical', Boolean(doc.canonical), 'A canonical address is declared.', `No canonical address is declared, so copies of this page with tracking parameters can split ${name}'s ranking.`, 'Add <link rel="canonical"> with the page\'s own address.', ev('canonical', doc.canonical || 'No canonical link.'));
  gap('language', Boolean(doc.language), `Language: ${doc.language}`, 'The page does not declare its language, so assistants may answer about it in the wrong language.', 'Add lang to the html element, for example lang="en".', ev('html-lang', doc.language || 'No lang attribute on html.'));
  gap('jsonld', !doc.invalidSchemas.length && doc.schemas.length > 0, `Structured data: ${doc.schemaTypes.join(', ')}`, doc.invalidSchemas.length ? `${plural(doc.invalidSchemas.length, 'structured data block')} on the page ${doc.invalidSchemas.length === 1 ? 'does' : 'do'} not parse, so assistants ignore ${doc.invalidSchemas.length === 1 ? 'it' : 'them'}.` : `The page has no structured data, so assistants read ${name} only as loose text.`, doc.invalidSchemas.length ? 'Fix the JSON syntax of the broken block.' : `Add a JSON-LD block describing ${name} as an Organization with its products or services.`, ev('jsonld', doc.invalidSchemas.join('; ') || doc.schemaTypes.join(', ') || 'No application/ld+json block.'));
  gap('entity', doc.entities.some((entity) => entity.name && (entity.url || entity.sameAs)), `Organization: ${doc.entities[0]?.name}`, `No Organization with a name and address is declared, so an assistant cannot be sure this page is the official ${name}.`, `Add an Organization block with name "${name}", url and sameAs links to your official profiles.`, ev('entity', doc.entities.map((entity) => `${entity.name || '(unnamed)'}; url ${Boolean(entity.url)}; sameAs ${Boolean(entity.sameAs)}`).join('; ') || 'No Organization or LocalBusiness block.'));
  gap('offers', doc.offers.length > 0, `${plural(doc.offers.length, 'priced offer')} in structured data.`, `No product or service carries a price in structured data, so when a buyer asks an assistant what ${name} costs it has no reliable figure to quote.`, 'Add an Offer with price and priceCurrency to each product or plan.', ev('offer', doc.offers.map((offer) => JSON.stringify({ price: offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price, currency: offer.priceCurrency ?? offer.priceSpecification?.priceCurrency })).join('; ') || 'No structured Offer with a price.'));
  if (observation.identity) add('identity', observation.identity.consistent ? 'pass' : 'problem', observation.identity.consistent ? 'Name, address and phone match across pages.' : `${name}'s address or phone differs between pages, so assistants may give buyers the wrong one.`, observation.identity.evidence, { fix: 'Use one address and phone everywhere.' });
  else unknown('identity', 'name, address and phone across pages');
  const pageWords = { about: ['an About page', `who runs ${name}`, 'Link an About page from the footer.'], contact: ['a contact page', `how to reach ${name}`, 'Link a contact page with an email address or form.'], pricing: ['a pricing page', `what ${name} costs`, 'Link a pricing page from the main menu.'] };
  for (const key of ['about', 'contact', 'pricing']) {
    const probe = probes[key], [thing, question, fix] = pageWords[key];
    if (!probe) gap(key, false, '', `The homepage links no ${thing.replace(/^an? /, '')}, so an assistant asked ${question} has nowhere to look.`, fix, ev('navigation', `No ${key} link on the homepage.`));
    else if (!probe.status) unknown(key, `${key} page`);
    else add(key, probe.ok && !probe.challenge ? 'pass' : 'problem', probe.ok && !probe.challenge ? `The ${key} page answered HTTP ${probe.status}.` : `The linked ${key} page returned HTTP ${probe.status}, so assistants following it find nothing.`, ev('http-status', probe.status, probe.finalUrl), { fix: `Repair the link to the ${key} page.` });
  }
  gap('freshness', doc.dates.length > 0, 'The page carries a publication or update date.', 'Nothing on the page is dated, so an assistant cannot tell whether prices and facts are current.', 'Add dateModified to your structured data, or a visible "Updated" date by prices.', ev('dates', doc.dates.join('; ') || 'No parseable date.'));
  const missingAlt = doc.images.filter((image) => image.alt === null);
  gap('images', !missingAlt.length, `All ${plural(doc.images.length, 'image')} have alt text.`, `${missingAlt.length} of ${plural(doc.images.length, 'image')} have no alt text, so assistants cannot tell what they show.`, 'Describe product and diagram images in alt text; use alt="" for decoration.', ev('image-alt', missingAlt.map((image) => image.src || '(inline image)').join('; ') || 'All images have alt.'));
  const md = probes.markdown;
  if (md && !md.status) unknown('markdown', 'text alternate');
  else gap('markdown', md?.ok && /text\/(plain|markdown)/i.test(md.contentType), 'A Markdown version of the page is linked.', `There is no Markdown version of the page, so assistants parse ${name}'s HTML layout instead of clean text.`, 'Publish a Markdown copy of key pages and link it with rel="alternate" type="text/markdown".', ev('text-alternate', md ? `HTTP ${md.status}; ${md.contentType}` : 'No text alternate linked.', md?.finalUrl || source));
  const llms = probes.llms;
  if (!llms?.status) unknown('llms', 'llms.txt');
  else {
    const broken = (llms.linkChecks || []).filter((link) => !(link.status >= 200 && link.status < 400));
    gap('llms', llms.guideValid, `llms.txt has ${plural(llms.sections, 'section')} and working links.`, !llms.ok ? `There is no llms.txt, the guide assistants look for to learn what ${name} offers.` : broken.length ? `llms.txt links to ${broken.map((link) => link.url).join(', ')}, which ${broken.length === 1 ? 'does' : 'do'} not load, so assistants following the guide hit a dead end.` : `llms.txt has ${plural(llms.sections || 0, 'section')} and ${plural(llms.linkChecks?.length || 0, 'checked link')}, too thin to guide an assistant.`, !llms.ok ? `Publish /llms.txt with a one-paragraph summary of ${name} and links to pricing, docs and contact.` : broken.length ? 'Fix or remove the broken links in llms.txt.' : 'Give llms.txt sections for what you sell, prices and how to buy, each with links.', ev('llms', `HTTP ${llms.status}; ${llms.bytes || 0} bytes; ${llms.sections || 0} sections. ${llms.linkChecks?.map((link) => `${link.url}: ${link.status || 'no answer'}`).join('; ') || ''}`, llms.finalUrl));
  }
  const sitemap = probes.sitemap;
  if (!sitemap?.status) unknown('sitemap', 'sitemap');
  else gap('sitemap', sitemap.ok && /<urlset\b|<sitemapindex\b/i.test(sitemap.body), 'An XML sitemap is published.', `There is no XML sitemap, so crawlers find ${name}'s pages only by following links.`, 'Publish /sitemap.xml and list it in robots.txt.', ev('sitemap', `HTTP ${sitemap.status}; XML sitemap ${/<urlset\b|<sitemapindex\b/i.test(sitemap.body)}`, sitemap.finalUrl));
  const lead = h1[0]?.value || '';
  gap('what', lead.length > 12 && doc.opening.length > 150, `Opening: ${excerpt(lead, 100)}`, lead && lead.length <= 12 ? `The main heading is just "${lead}", so an assistant asked what ${name} does gets no answer from it.` : lead ? `The opening is "${excerpt(lead, 80)}" with little text under it, so an assistant asked what ${name} does has almost nothing to quote.` : `There is no headline and opening paragraph saying what ${name} does, so an assistant has to guess from the menu.`, `Open with one sentence that says what ${name} does, followed by a short paragraph.`, ev('opening-copy', doc.opening));
  const buyer = "(?:you|teams?|business(?:es)?|compan(?:y|ies)|developers?|engineers?|agents?|founders?|startups?|enterprises?|creators?|merchants?|sellers?|customers?|brands?|marketers?|designers?|people|organi[sz]ations?|anyone|everyone|famil(?:y|ies)|shoppers?|owners?|professionals?|stores?|shops?)";
  const audience = new RegExp(`\\b(?:(?:for|built for|designed for|made for|helps?|helping|trusted by|used by|lets?)\\s+(?:[\\w'-]+\\s+){0,3}?${buyer}|your\\s+${buyer}|(?:millions|thousands|hundreds) of\\s+(?:[\\w'-]+\\s+){0,2}?${buyer})\\b`, 'i');
  gap('who', audience.test(doc.opening), 'The opening names who it is for.', `The opening never says who ${name} is for, so an assistant cannot match it to a buyer who asks "what should a company like mine use".`, `Name your buyer in the first lines, for example "${name} for small online stores".`, ev('opening-copy', doc.opening));
  const actionLink = doc.links.find((link) => /buy|book|order|start|quote|contact|try|shop|sign up|get started/i.test(link.label));
  const priceDetail = !doc.priceText && !actionLink ? `The homepage shows no price and no buy or book link. When a buyer asks an AI what ${name} costs, it has nothing on this page to quote and nowhere to send them.` : !doc.priceText ? `The homepage shows no price. When a buyer asks an AI what ${name} costs, it has nothing on this page to quote.` : `The homepage shows a price but no buy, book or start link, so an assistant cannot send the buyer anywhere.`;
  gap('purchase', Boolean(doc.priceText && actionLink), `Price "${doc.priceText}" with "${actionLink?.label}".`, priceDetail, !doc.priceText ? 'Put a starting price on the homepage next to the main button, for example "from 20 USD a month".' : 'Put a "Buy" or "Book" link next to the price.', [...ev('price-text', doc.priceText || 'No price in the page text.'), ...ev('action-link', actionLink ? `${actionLink.label}: ${actionLink.url}` : 'No buy, book, order or start link.')]);
  const questions = doc.faq.filter((item) => item.name).map((item) => String(item.name)).concat(doc.headings.filter((heading) => /[?？]/.test(heading.value)).map((heading) => heading.value));
  gap('faq', questions.length >= 2, `${plural(questions.length, 'buyer question')} answered on the page.`, questions.length ? `Only one buyer question is answered on the page ("${excerpt(questions[0], 60)}"), so assistants have little to quote when buyers ask about ${name}.` : `The page answers no buyer questions, so when someone asks an assistant how ${name} works, what it costs or how fast it delivers, the answer comes from somewhere else.`, 'Add five real questions with short answers (price, timing, delivery, support) and mark them up as FAQPage.', ev('buyer-questions', questions.join('; ') || 'No question headings or FAQPage questions.'));
  if (!doc.controls) unknown('forms', 'form labels (no form on the page)');
  else gap('forms', !doc.missingLabels.length, `All ${plural(doc.controls, 'form field')} are labelled.`, `${doc.missingLabels.length} of ${plural(doc.controls, 'form field')} have no label (${doc.missingLabels.map((item) => item.name).slice(0, 3).join(', ')}), so an agent filling the form cannot tell what goes where.`, 'Give each field a visible label tied to it with for and id.', ev('form-labels', JSON.stringify(doc.missingLabels)));
  const action = probes.action;
  if (!action?.status) unknown('public-action', 'buy or book route');
  else add('public-action', action.ok && !action.loginWall ? 'pass' : 'upgrade', action.ok && !action.loginWall ? `The buy or book link answers (HTTP ${action.status}). Nothing was ordered.` : `The buy or book link leads to ${action.loginWall ? 'a sign-in page' : `HTTP ${action.status}`}, so an agent cannot start an order for a buyer.`, ev('action-head', `HTTP ${action.status}; ${action.finalUrl}`, action.finalUrl), { fix: 'Give agents a public order or booking route that needs no account to start.' });
  const wallet = /\b(?:apple pay|google pay|stripe link|pay with link)\b/i.exec(doc.visible);
  gap('wallets', Boolean(wallet), `Payment methods named: ${wallet?.[0]}.`, `The page names no wallet (Apple Pay, Google Pay, Link), so an agent cannot tell whether ${name} can be paid in one step.`, 'Name the wallets your checkout accepts next to the price.', ev('wallet-declaration', wallet?.[0] || 'No wallet named.'));
  const capability = {
    mcp: [`${name} has no MCP server, so a buyer cannot ask ChatGPT or Claude to use ${name} directly.`, 'Publish an MCP server for your main task and describe it at /.well-known/mcp/server.json.'],
    a2a: [`${name} publishes no agent card, so other agents cannot discover what it can do for them.`, 'Publish /.well-known/agent-card.json listing your skills.'],
    openapi: [`${name} publishes no OpenAPI contract, so agents cannot call it without custom code.`, 'Publish /openapi.json for your public API.'],
    feeds: [`${name} has no agent checkout feed, so AI shopping assistants cannot list or buy its products.`, 'Publish a product feed agents can order from (UCP or ACP).'],
  };
  for (const id of ['mcp', 'a2a', 'openapi', 'feeds']) {
    const probe = probes[id];
    if (!probe?.status) unknown(id, `${id === 'feeds' ? 'checkout feed' : id === 'a2a' ? 'agent card' : id.toUpperCase()} discovery`);
    else if (id === 'mcp' && !probe.valid && probe.declared) add(id, 'unknown', `MCP (the site names ${probe.declared}; this check does not call it)`, ev('declared-endpoint', probe.declared, probe.finalUrl));
    else gap(id, Boolean(probe.valid), 'A readable discovery document is published. Nothing was called.', capability[id][0], capability[id][1], ev('discovery', `HTTP ${probe.status}; recognized ${Boolean(probe.valid)}`, probe.finalUrl));
  }
  const payment = probes.payment;
  if (payment?.status === 402) add('payment', payment.valid ? 'pass' : payment.error ? 'problem' : 'unknown', payment.valid ? 'The unpaid x402 challenge parses. No payment was made.' : payment.error ? `The x402 payment challenge does not parse: ${payment.error}. Agents cannot pay it.` : 'x402 challenge', ev('payment-challenge', payment.error || payment.networks?.join('; ') || 'HTTP 402'), { fix: 'Return a valid x402 challenge with a supported network and payee.' });
  else gap('payment', Boolean(payment?.documented), 'A payment protocol is documented. Nothing was paid.', `${name} documents no way for an agent to pay (x402 or similar), so agents cannot buy from it on their own.`, 'Add an x402 or Stripe agent payment route to the action agents use most.', ev('payment-discovery', `HTTP ${payment?.status || 'no answer'}; documented ${Boolean(payment?.documented)}`));
  gap('webmcp', doc.webmcpDeclared, 'The page declares WebMCP tools.', `The page declares no browser tools (WebMCP), so an assistant in the buyer's browser has to click through ${name} like a person.`, 'Register your main page actions as WebMCP tools.', ev('webmcp-declaration', doc.webmcpDeclared ? 'modelContext or toolname in HTML.' : 'No WebMCP declaration.'));
  if (observation.crux?.metrics) { const [lcp, cls, inp] = observation.crux.metrics; add('crux', observation.crux.good ? 'pass' : 'problem', observation.crux.good ? `Real Chrome users see LCP ${Math.round(lcp)} ms, CLS ${cls}, INP ${Math.round(inp)} ms on phones.` : `Real Chrome users on phones see LCP ${Math.round(lcp)} ms, CLS ${cls}, INP ${Math.round(inp)} ms, outside Google's good range, which costs ${name} search ranking.`, ev('crux-field', JSON.stringify(observation.crux)), { fix: lcp > 2500 ? 'Shrink and preload the largest image or font on the first screen.' : cls > 0.1 ? 'Reserve space for images and banners so the page stops jumping.' : 'Break up long scripts that run on tap.' }); }
  else unknown('crux', 'field Core Web Vitals');
  const mobile = /width\s*=\s*device-width|initial-scale\s*=\s*1(?:\.0*)?(?![\d.])/i.test(doc.viewport || '');
  add('viewport', mobile ? 'pass' : 'problem', mobile ? 'The page sets a mobile viewport.' : `The page sets no mobile viewport, so phones show ${name} zoomed out and Google ranks it as not mobile friendly.`, ev('viewport', doc.viewport || 'No viewport meta element.'), { fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
  const verifiedAction = Boolean(action?.ok && !action.loginWall && doc.controls && !doc.missingLabels.length) || ['mcp', 'a2a', 'openapi', 'feeds'].some((id) => probes[id]?.valid) || Boolean(payment?.valid);
  return finish(result, observation, verifiedAction, name);
}
function finish(checks, observation, verifiedAction, name) {
  const earned = checks.reduce((sum, item) => sum + (item.status === 'pass' ? item.weight : 0), 0);
  const unknown = checks.reduce((sum, item) => sum + (item.status === 'unknown' ? item.weight : 0), 0);
  const cap = verifiedAction ? 100 : 75;
  const score = Math.min(cap, earned);
  // The three changes worth the most points, Problems first, and the offer that covers most of them.
  const rank = (status) => checks.filter((item) => item.status === status).sort((a, b) => b.weight - a.weight);
  const top = [...rank('problem'), ...rank('upgrade')].slice(0, 3);
  const offers = new Map();
  for (const item of top) if (item.offer) offers.set(item.offer, (offers.get(item.offer) || 0) + item.weight);
  const offer = [...offers].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { version: 2, ruleVersion: RULE_VERSION, ruleSha256: RULE_SHA256,
    url: observation.url, name, checkedAt: new Date().toISOString(), score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    scoring: { earned, unknown, maximum: 100, cap, verifiedAction, possibleWithUnknowns: Math.min(cap, earned + unknown), meaning: 'Points confirmed by this public read-only check. Checks this run could not measure earn no points.' },
    groups: [...new Set(RULES.map((rule) => rule.group))].map((group) => ({ group, maximum: RULES.filter((rule) => rule.group === group).reduce((sum, rule) => sum + rule.weight, 0), earned: checks.filter((rule) => rule.group === group && rule.status === 'pass').reduce((sum, rule) => sum + rule.weight, 0) })),
    summary: { wordsOnHomepage: observation.document?.words || 0, lang: observation.document?.language || null, canonical: observation.document?.canonical || null, h1: observation.document?.headings.find((heading) => heading.level === 1)?.value || null,
      problems: checks.filter((item) => item.status === 'problem').length, upgrades: checks.filter((item) => item.status === 'upgrade').length,
      topFixes: top.map((item) => ({ id: item.id, label: item.label, points: item.weight, status: item.status, fix: item.fix })), offer,
      notMeasured: checks.filter((item) => item.status === 'unknown').map((item) => ({ id: item.id, label: item.detail, points: item.weight })) },
    checks, policies: observation.policies || [], requests: observation.requests || [],
    limitations: ['Requests named as crawlers come from this checker, not the providers\' addresses, and do not show indexing.', 'This check never submits a form, signs in, calls a tool or makes a payment.'],
  };
}
