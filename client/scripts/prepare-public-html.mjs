import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, dirname } from "node:path";
import { publishedRustLinks } from "./rust-book-links.mjs";
import { applyReferenceSearchContent } from "./reference-search-content.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const rustLinks = await publishedRustLinks(join(dist, 'docs/rust-itertools'));
const additions = '<link rel="stylesheet" href="/public-access.css"><script defer src="/public-access.js"></script>';
async function receive(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await receive(file);
    else if (entry.name.endsWith(".html")) {
      const original = await readFile(file, "utf8");
      const pathname = "/" + relative(dist, file).replaceAll("\\", "/");
      let html = applyReferenceSearchContent(original, pathname);
      // The standalone guides predate the responsive React table component.
      // Keep their real table markup inside a native keyboard-scrollable pane.
      if (!html.includes('id="root"') && !html.includes('id="sourcey"') && !html.includes('class="sdd-scroll-table"')) {
        html = html.replace(/<table\b[\s\S]*?<\/table>/gi, table =>
          `<div class="sdd-scroll-table" role="region" aria-label="Scrollable table" tabindex="0">${table}</div>`);
      }
      const directory = "/" + relative(dist, dirname(file)).replaceAll("\\", "/");
      if (html.includes('id="sourcey"')) {
        html = html.replace(/href="\/(package-root|pkg-[^"/?#]+|doctests)\.html([#?][^"]*)?"/g,
          (_match, page, tail = "") => `href="${directory}/${page}.html${tail}"`);
      }
      if (directory === '/docs/rust-itertools') html = rustLinks(html, entry.name);
      if (!html.includes('src="/public-access.js"')) html = html.replace(/<\/head>/i, `${additions}</head>`);
      if (html !== original) await writeFile(file, html);
    }
  }
}
await receive(dist);
