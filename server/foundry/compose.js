import { ENTRY_MOUNT_URL } from "./paths.js";
import { hostInputsFromEnv } from "./private-files.js";

export async function loadCreateEntryReuseMount() {
  const mod = await import(ENTRY_MOUNT_URL);
  if (typeof mod.createEntryReuseMount !== "function") {
    throw new Error("canonical entry mount is missing createEntryReuseMount");
  }
  return mod.createEntryReuseMount;
}

// Bind the store's current checkReady before replacing it. The facade's own
// checkReady must keep using that binding; calling the replaced method would recurse.
export async function openEntryFacade({
  store,
  config,
  env = process.env,
  createEntryReuseMount,
  hostProfile,
  participationKey,
  onStartupStage = () => {},
}) {
  let profile = hostProfile;
  let key = participationKey;
  if (!profile || !key) {
    onStartupStage("profile_load");
    const loaded = hostInputsFromEnv(env);
    if (!loaded.ok) {
      const error = new Error(loaded.reason);
      error.code = loaded.reason;
      throw error;
    }
    profile = loaded.hostProfile;
    key = loaded.participationKey;
  }
  onStartupStage("entry_module");
  const create = createEntryReuseMount || await loadCreateEntryReuseMount();
  onStartupStage("entry_create");
  const mounted = await create({
    enabled: true,
    databaseUrl: config.databaseUrl,
    schema: config.pgSchema,
    correspondence: store,
    config,
    hostProfile: profile,
    participationKey: key,
    poolMax: 2,
  });
  const baseReady = typeof store.checkReady === "function" ? store.checkReady.bind(store) : async () => {};
  store.checkReady = async () => {
    onStartupStage("base_readiness");
    await baseReady();
    onStartupStage("entry_readiness");
    await mounted.checkReady();
  };
  return { mounted, baseReady };
}

export async function closeEntryThenBase(entry, store) {
  try {
    if (entry?.close) await entry.close();
  } finally {
    if (store?.close) await store.close();
  }
}
