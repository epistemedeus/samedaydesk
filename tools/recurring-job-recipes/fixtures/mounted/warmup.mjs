import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const merchantFixtures = join(here, "..", "merchant", "page-change", "merchant");

export async function warmPageChangeOrigin(origin) {
  const before = JSON.parse(readFileSync(join(merchantFixtures, "unchanged-before.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(merchantFixtures, "unchanged-after.json"), "utf8"));
  await fetch(origin.routes.pageChange, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      before: { mediaType: "application/json", body: before },
      after: { mediaType: "application/json", body: after },
      fields: ["title"],
    }),
  });
}
