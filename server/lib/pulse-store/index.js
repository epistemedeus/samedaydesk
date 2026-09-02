import crypto from "node:crypto";
import { createFileFallbackStore } from "./file-fallback.js";
import {
  createPulseStoreFromTransport,
  createSupabasePulseTransport,
} from "./supabase-adapter.js";

export * from "./schema.js";
export { createFileFallbackStore } from "./file-fallback.js";
export { createPulseStoreFromTransport, createSupabasePulseTransport } from "./supabase-adapter.js";
export { atomicWriteJson } from "./atomic-write.js";

export function newFlushId() {
  return crypto.randomUUID();
}

function isSupabaseConfiguredFromEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createDefaultPulseStore(options = {}) {
  if (options.transport) {
    return createPulseStoreFromTransport(options.transport, {
      configured: options.configured ?? true,
    });
  }
  if (options.forceFallback || !isSupabaseConfiguredFromEnv()) {
    return createPulseStoreFromTransport(
      {
        async rpc() {
          throw new Error("pulse_unconfigured");
        },
      },
      { configured: false },
    );
  }
  let clientPromise = null;
  async function rpc(fn, args) {
    if (!clientPromise) {
      clientPromise = import("../supabase-admin.js").then(({ supabaseAdmin }) => supabaseAdmin());
    }
    const client = await clientPromise;
    return client.rpc(fn, args);
  }
  return createPulseStoreFromTransport(createSupabasePulseTransport(rpc), { configured: true });
}

export function createDefaultFileFallback(filePath) {
  return createFileFallbackStore(filePath);
}
