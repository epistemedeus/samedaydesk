import { writeFileSync } from "node:fs";
import { schemas } from "../src/schemas.mjs";
import { openapi } from "../src/contracts.mjs";
if (process.argv[2] !== "--write" || process.argv.length !== 3) throw new Error("use --write");
writeFileSync(new URL("../schemas/contracts.json", import.meta.url), `${JSON.stringify(schemas, null, 2)}\n`);
writeFileSync(new URL("../openapi.json", import.meta.url), `${JSON.stringify(openapi(), null, 2)}\n`);
