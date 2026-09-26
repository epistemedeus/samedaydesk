import { prepareFoundryHost, foundryHostOptIn } from "@neomorphic/correspondence";
import { loadFoundryExtension } from "./layout.js";

export async function composeFoundryOnStore({ store, env, config, createFoundryExtension }) {
  const optedIn = foundryHostOptIn(env);
  let create = null;
  let reason = optedIn ? "layout_unavailable" : "opt_in_unset";
  let missing = [];
  if (optedIn && typeof createFoundryExtension === "function") {
    create = createFoundryExtension;
    reason = "injected";
  } else if (optedIn && env.FOUNDRY_F93_ROOT) {
    const loaded = await loadFoundryExtension(env.FOUNDRY_F93_ROOT, config);
    if (loaded.ok) {
      create = loaded.create;
      reason = "export";
    } else {
      reason = loaded.reason || "layout_unavailable";
      missing = loaded.missing || [];
    }
  }
  const lifecycle = await prepareFoundryHost(store, {
    enabled: create != null,
    create: create ?? undefined,
  });
  return { lifecycle, optedIn, extension: create != null, reason, missing };
}
