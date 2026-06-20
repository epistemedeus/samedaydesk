import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isAuthConfigured } from "./supabase";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({ user: null, session: null, loading: true, signOut: async () => {} });

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthConfigured()) {
      setLoading(false);
      return;
    }
    let unsub: (() => void) | undefined;
    let cancelled = false;

    getSupabase().then(async (sb) => {
      if (!sb || cancelled) {
        setLoading(false);
        return;
      }
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
      const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
      unsub = () => sub.subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const signOut = async () => {
    const sb = await getSupabase();
    await sb?.auth.signOut();
    setSession(null);
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
