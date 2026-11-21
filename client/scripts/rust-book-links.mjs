import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const standardLinks = JSON.parse(await readFile(new URL('./rust-standard-links.json', import.meta.url), 'utf8'));
const prefix = '/docs/rust-itertools/';

export async function publishedRustLinks(directory) {
  const pages = new Map();
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.html') && name !== 'index.html').sort()) {
    const html = await readFile(join(directory, name), 'utf8');
    pages.set(name, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])));
  }
  function destination(href, currentPage) {
    if (standardLinks[href]) return standardLinks[href];
    const url = new URL(href, 'https://samedaydesk.com' + prefix + currentPage);
    if (url.origin !== 'https://samedaydesk.com' || !url.pathname.startsWith(prefix) || !url.pathname.endsWith('.html')) return href;
    const page = basename(url.pathname), fragment = decodeURIComponent(url.hash.slice(1));
    const existing = page === 'index.html' ? pages.get('pkg-itertools-itertools-structs.html') : pages.get(page);
    if (existing && (!fragment || existing.has(fragment))) return href;
    const name = fragment.split('.').slice(1).join('.');
    // Sourcey emits implementation-module URLs for public reexports. Resolve
    // each symbol to a section actually emitted in this pinned public book.
    const candidates = [fragment, `reexport.${name}`, `method.${name}`, `doctest-fn.${name}-0`, `doctest-macro.${name}-0`];
    if (name === 'CombinationsWithReplacementGeneric') candidates.unshift('method.array_combinations_with_replacement');
    for (const id of candidates) for (const [target, ids] of pages) {
      if (ids.has(id)) return prefix + target + url.search + '#' + id;
    }
    throw new Error(`Unresolved published Rust reference: ${currentPage}: ${href}`);
  }
  return (html, currentPage) => html.replace(/(<a\b[^>]*\bhref=")([^"]+)(")/g,
    (_all, before, href, after) => before + destination(href, currentPage) + after);
}
