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
      const html = await readFile(file, "utf8");
      if (!html.includes('src="/public-access.js"')) await writeFile(file, html.replace(/<\/head>/i, `${additions}</head>`));
    }
  }
}
await receive(dist);
