import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CUSTOMER_X402_ROOT, PATCH_FILES_ROOT } from "./paths.mjs";

/**
 * Disposable customer-x402 tree: merchant sources + this recipe's tiny patch.
 * Does not edit the mounted merchant checkout in place.
 */
export async function materializePatchedCustomerX402(destDir, {
  merchantClientRoot = CUSTOMER_X402_ROOT,
  patchFilesRoot = PATCH_FILES_ROOT,
} = {}) {
  if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true });
  await mkdir(join(destDir, "src"), { recursive: true });
  await mkdir(join(destDir, "bin"), { recursive: true });
  await mkdir(join(destDir, "fixtures"), { recursive: true });
  await cp(join(merchantClientRoot, "src"), join(destDir, "src"), { recursive: true });
  await cp(join(merchantClientRoot, "bin"), join(destDir, "bin"), { recursive: true });
  await cp(join(merchantClientRoot, "package.json"), join(destDir, "package.json"));
  const overlay = join(patchFilesRoot, "examples/customer-x402");
  await cp(join(overlay, "src/authorization.mjs"), join(destDir, "src/authorization.mjs"));
  await cp(join(overlay, "src/constants.mjs"), join(destDir, "src/constants.mjs"));
  await cp(join(overlay, "bin/cli.mjs"), join(destDir, "bin/cli.mjs"));
  await cp(join(overlay, "fixtures"), join(destDir, "fixtures"), { recursive: true });
  await symlink(join(merchantClientRoot, "node_modules"), join(destDir, "node_modules"));
  return destDir;
}

export async function loadCustomerX402(root) {
  const href = (rel) => pathToFileURL(join(root, rel)).href;
  const [{ runAuthorizedPurchase }, { runPreflight }, authorization, { resolveBuyerAccount }, constants] =
    await Promise.all([
      import(href("src/purchase.mjs")),
      import(href("src/preflight.mjs")),
      import(href("src/authorization.mjs")),
      import(href("src/wallet.mjs")),
      import(href("src/constants.mjs")),
    ]);
  return {
    runAuthorizedPurchase,
    runPreflight,
    normalizeAuthorization: authorization.normalizeAuthorization,
    AuthorizationRefusal: authorization.AuthorizationRefusal,
    resolveBuyerAccount,
    constants,
  };
}
