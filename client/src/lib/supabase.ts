import type { SupabaseClient } from "@supabase/supabase-js";

// Public anon/publishable key, safe in the browser. The client is created lazily via a
// dynamic import so supabase-js stays out of the critical landing bundle (loads post-LCP).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthConfigured = () => Boolean(url && anon);

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isAuthConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url!, anon!, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }),
    );
  }
  return clientPromise;
}

// Attach the user's access token to API calls; the Express server verifies it.
export async function authedFetch(path: string, init: RequestInit = {}) {
  const sb = await getSupabase();
  let token: string | undefined;
  if (sb) {
    const { data } = await sb.auth.getSession();
    token = data.session?.access_token;
  }
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}
