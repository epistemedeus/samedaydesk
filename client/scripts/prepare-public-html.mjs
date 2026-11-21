import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const additions = '<link rel="stylesheet" href="/public-access.css"><script defer src="/public-access.js"></script>';
async function receive(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await receive(file);
    else if (entry.name.endsWith(".html")) {
      let html = await readFile(file, "utf8");
      // The standalone guides predate the responsive React table component.
      // Keep their real table markup inside a native keyboard-scrollable pane.
      if (!html.includes('id="root"') && !html.includes('id="sourcey"') && !html.includes('class="sdd-scroll-table"')) {
        html = html.replace(/<table\b[\s\S]*?<\/table>/gi, table =>
          `<div class="sdd-scroll-table" role="region" aria-label="Scrollable table" tabindex="0">${table}</div>`);
      }
      if (!html.includes('src="/public-access.js"')) await writeFile(file, html.replace(/<\/head>/i, `${additions}</head>`));
    }
  }
}
await receive(dist);
