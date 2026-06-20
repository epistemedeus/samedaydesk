import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSupabase, isAuthConfigured, authedFetch } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { ALL_OFFERS } from "../lib/services";
import { track } from "../lib/posthog";
import styles from "./Auth.module.css";

export default function Auth({ mode }: { mode: "login" | "signup" }) {
  const [params] = useSearchParams();
  const offerSlug = params.get("offer") || undefined;
  const offer = ALL_OFFERS.find((o) => o.slug === offerSlug);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dest = () => (offerSlug ? `/dashboard?offer=${offerSlug}` : "/dashboard");
  const altQuery = offerSlug ? `?offer=${offerSlug}` : "";

  useEffect(() => {
    if (!loading && user) navigate(dest(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  async function google() {
    setError(null);
    setBusy(true);
    try {
      const sb = await getSupabase();
      if (!sb) throw new Error("Auth isn't configured in this environment yet.");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${dest()}` },
      });
      if (error) throw error; // on success the browser redirects to Google
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in.");
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const sb = await getSupabase();
      if (!sb) throw new Error("Auth isn't configured in this environment yet.");
      const { data, error } =
        mode === "signup"
          ? await sb.auth.signUp({ email, password })
          : await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      track(mode === "signup" ? "signup_completed" : "login", { offer: offerSlug });
      if (mode === "signup" && data.session) {
        authedFetch("/api/auth/welcome", { method: "POST" }).catch(() => {}); // best-effort
      }
      if (data.session) navigate(dest(), { replace: true });
      else setNotice("Almost there — check your email to confirm your account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.panel}>
        <Link to="/" className={styles.brand} viewTransition>
          <span className={styles.mark} aria-hidden="true">▸▸</span> SameDayDesk
        </Link>

        <h1 className={styles.h1}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className={styles.lede}>
          {mode === "signup"
            ? "One account to send a task, track delivery, and pay securely."
            : "Sign in to pick up where you left off."}
        </p>

        {offer && (
          <p className={styles.intent}>
            You're starting <strong>{offer.name}</strong> · <span className="mono lime">${offer.price}</span>
          </p>
        )}

        <button type="button" className={styles.google} onClick={google} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        <div className={styles.divider}><span>or</span></div>

        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
            />
          </label>
          <label className={styles.field}>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            />
          </label>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {!isAuthConfigured() && <p className={styles.error}>Auth isn't configured in this environment.</p>}

          <button className={styles.submit} disabled={busy} type="submit">
            {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className={styles.alt}>
          {mode === "signup" ? (
            <>Already have an account? <Link to={`/login${altQuery}`} viewTransition>Sign in</Link></>
          ) : (
            <>New here? <Link to={`/signup${altQuery}`} viewTransition>Create an account</Link></>
          )}
        </p>
        <p className={styles.fine}>
          By continuing you agree to our <Link to="/terms" viewTransition>Terms</Link> and{" "}
          <Link to="/privacy" viewTransition>Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
