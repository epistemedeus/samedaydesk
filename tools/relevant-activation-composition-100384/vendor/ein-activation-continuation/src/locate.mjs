/** SPDX-License-Identifier: MIT
 * Locate the existing public formation HTTP client. A packed archive vendors it.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { ContinuationError, recovery } from "./errors.mjs";

function clientRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../vendor/ein-formation-http-client"),
    join(here, "../../public-ein-http-client"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "lib/http.mjs")) && existsSync(join(dir, "lib/grant.mjs"))) return dir;
  }
  throw new ContinuationError({
    code: "public_client_missing",
    message: "The public EIN formation HTTP client is not beside this package or under vendor/.",
    recovery: recovery(
      "install_public_client",
      "Run this package from the repository checkout or from the packed archive that vendors ein-formation-http-client.",
    ),
  });
}

let loaded;

export async function publicClient() {
  if (loaded) return loaded;
  const root = clientRoot();
  const [http, grant, client] = await Promise.all([
    import(pathToFileURL(join(root, "lib/http.mjs")).href),
    import(pathToFileURL(join(root, "lib/grant.mjs")).href),
    import(pathToFileURL(join(root, "client.mjs")).href),
  ]);
  loaded = { root, http, grant, client };
  return loaded;
}
