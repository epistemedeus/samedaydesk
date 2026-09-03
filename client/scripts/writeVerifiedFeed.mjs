import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateVerifiedFeed } from "./generateVerifiedFeed.mjs";
import { validateVerifiedFeed } from "./verifiedFeedValidation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(process.argv[2] || path.join(here, "../public/x402/verified.json"));

const feed = generateVerifiedFeed();
validateVerifiedFeed(feed);
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(feed, null, 2)}\n`);
console.log(`[verified-feed] ${outFile} (${feed.routes.length} routes)`);
