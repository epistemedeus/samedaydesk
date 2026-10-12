import { resolve } from "node:path";
import { validateTermsFile } from "../src/cli.js";

export function main(argv: string[]): void {
  const file = argv[0];
  if (!file || file === "-h" || file === "--help") {
    console.error("usage: node bin/validate.mjs <terms.json>");
    process.exit(file ? 0 : 2);
  }
  try {
    const result = validateTermsFile(resolve(file));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const err = error as Error & { code?: string; path?: Array<string | number> };
    const payload = {
      ok: false as const,
      code: err.code ?? "invalid_terms",
      message: err.message,
      path: err.path ?? [],
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

main(process.argv.slice(2));
