import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public anon/publishable key — safe in the browser. Null until configured.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const isAuthConfigured = () => supabase !== null;

// Attach the user's access token to API calls; the Express server verifies it.
export async function authedFetch(path: string, init: RequestInit = {}) {
  let token: string | undefined;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
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
