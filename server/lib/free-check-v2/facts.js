import { parse } from 'parse5';

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const ignored = new Set(['script', 'style', 'template', 'noscript', 'svg']);
export const excerpt = (value, size = 220) => normalize(value).slice(0, size);
export function publicLink(value, base) {
  try {
    if (typeof value !== 'string' || !value.trim()) return null;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    // Never retain query tokens or submit forms while discovering a public route.
    url.search = '';
    return url.href;
  } catch { return null; }
}
function text(node, all = false) {
  if (!all && (ignored.has(node.tagName) || (node.attrs || []).some((a) => a.name === 'hidden' || a.name === 'aria-hidden' && a.value === 'true'))) return '';
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes || []).map((child) => text(child, all)).join(' ');
}
function opening(visible, headings, tag) {
  const h1 = headings.find((heading) => heading.level === 1)?.value;
  const at = h1 ? visible.indexOf(h1) : -1;
  if (at >= 0) return visible.slice(at, at + 850);
  const main = tag('main')[0];
  return normalize(main ? text(main) : visible).slice(0, 850);
}
export function analyzeDocument(body, url) {
  const root = parse(String(body || ''));
  const nodes = [];
  function walk(node) { if (node.tagName) nodes.push(node); for (const child of node.childNodes || []) walk(child); }
  walk(root);
  const attr = (node, name) => node?.attrs?.find((a) => a.name === name)?.value ?? null;
  const tag = (name) => nodes.filter((node) => node.tagName === name);
  const meta = (name) => attr(tag('meta').find((node) => attr(node, 'name')?.toLowerCase() === name || attr(node, 'property')?.toLowerCase() === name), 'content');
  const links = tag('a').map((node) => ({ url: publicLink(attr(node, 'href'), url), label: excerpt(text(node), 100) })).filter((item) => item.url);
  const linkRel = (name) => tag('link').filter((node) => (attr(node, 'rel') || '').split(/\s+/).includes(name));
  const schemas = [], invalidSchemas = [];
  for (const node of tag('script').filter((node) => attr(node, 'type')?.toLowerCase() === 'application/ld+json')) {
    const raw = text(node, true);
    try {
      const data = JSON.parse(raw);
      const collect = (item, depth = 0) => {
        if (depth > 16 || !item || typeof item !== 'object') return;
        if (Array.isArray(item)) return item.forEach((value) => collect(value, depth + 1));
        if (item['@type']) schemas.push(item);
        for (const value of Object.values(item)) if (typeof value === 'object') collect(value, depth + 1);
      };
      collect(data);
    } catch { invalidSchemas.push(excerpt(raw, 120)); }
  }
  const types = (node) => [].concat(node?.['@type'] || []).map(String);
  const ofType = (names) => schemas.filter((node) => types(node).some((type) => names.includes(type.replace(/^https?:\/\/schema.org\//, ''))));
  const entities = ofType(['Organization', 'Corporation', 'LocalBusiness', 'Store', 'Restaurant', 'ProfessionalService']);
  const products = ofType(['Product', 'Service', 'SoftwareApplication']);
  const offers = ofType(['Offer', 'AggregateOffer']).filter((node) => node.price !== undefined || node.lowPrice !== undefined || node.priceSpecification?.price !== undefined);
  const headings = nodes.filter((node) => /^h[1-6]$/.test(node.tagName)).map((node) => ({ level: Number(node.tagName[1]), value: excerpt(text(node)) }));
  const visible = normalize(text(tag('body')[0] || root));
  const labels = new Map(tag('label').map((node) => [attr(node, 'for'), normalize(text(node))]));
  // Hidden from assistive technology (aria-hidden, hidden, inert, here or above): framework mirror
  // inputs and CSS menu toggles. Nobody is asked to fill them, so they need no label.
  const concealed = (node) => { for (let n = node; n?.tagName; n = n.parentNode) if (attr(n, 'aria-hidden') === 'true' || attr(n, 'hidden') !== null || attr(n, 'inert') !== null) return true; return false; };
  const controls = nodes.filter((node) => ['input', 'select', 'textarea'].includes(node.tagName) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(attr(node, 'type')) && attr(node, 'disabled') === null && !concealed(node));
  const missingLabels = controls.filter((node) => {
    let parent = node.parentNode;
    while (parent) { if (parent.tagName === 'label' && normalize(text(parent))) return false; parent = parent.parentNode; }
    const labelled = (attr(node, 'aria-labelledby') || '').split(/\s+/).some((id) => nodes.some((candidate) => attr(candidate, 'id') === id && normalize(text(candidate))));
    return !(labels.get(attr(node, 'id')) || attr(node, 'aria-label')?.trim() || attr(node, 'title')?.trim() || attr(node, 'placeholder')?.trim() || labelled);
  }).map((node) => ({ tag: node.tagName, name: attr(node, 'name') || attr(node, 'id') || '(unnamed)' }));
  const dates = schemas.flatMap((node) => [node.dateModified, node.datePublished]).concat(tag('time').map((node) => attr(node, 'datetime'))).filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)));
  return {
    url, title: normalize(text(tag('title')[0] || {})), description: meta('description'),
    canonical: publicLink(attr(linkRel('canonical')[0], 'href'), url),
    language: attr(tag('html')[0], 'lang'), viewport: meta('viewport'), robots: meta('robots'),
    // The opening is the copy from the main heading on, not the menu above it.
    headings, visible, opening: opening(visible, headings, tag), siteName: normalize(meta('og:site_name')) || null, words: visible.split(/\s+/).filter(Boolean).length,
    links, schemas, schemaTypes: [...new Set(schemas.flatMap(types))], invalidSchemas,
    entities, products, offers, faq: ofType(['FAQPage', 'Question']), dates,
    images: tag('img').map((node) => ({ src: publicLink(attr(node, 'src'), url), alt: attr(node, 'alt') })),
    controls: controls.length, missingLabels,
    markdown: tag('link').filter((node) => /text\/(markdown|plain)/.test(attr(node, 'type') || '')).map((node) => publicLink(attr(node, 'href'), url)).filter(Boolean),
    hreflang: tag('link').filter((node) => attr(node, 'hreflang')).map((node) => ({ language: attr(node, 'hreflang'), url: publicLink(attr(node, 'href'), url) })),
    webmcpDeclared: /(?:navigator\s*\.\s*modelContext|toolname\s*=)/i.test(body),
    priceText: excerpt(visible.match(/(?:[$€£]\s*\d[\d,.]*(?:\s*(?:\/|per)\s*\w+)?|\b\d[\d,.]*\s*(?:USD|EUR|GBP)\b|\bfree\s+(?:plan|trial|tier)\b)/i)?.[0]),
  };
}
