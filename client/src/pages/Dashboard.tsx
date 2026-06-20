import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { authedFetch } from "../lib/supabase";
import { CATEGORIES } from "../lib/services";
import styles from "./Dashboard.module.css";

type Me = { uid: string; email: string; emailVerified: boolean };

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    authedFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }, []);

  return (
    <main className={styles.wrap}>
      <header className={styles.top}>
        <Link to="/" className={styles.brand} viewTransition>
          <span className={styles.mark} aria-hidden="true">▸▸</span> SameDayDesk
        </Link>
        <button className={styles.signout} onClick={() => signOut()}>Sign out</button>
      </header>

      <h1 className={styles.h1}>Your desk</h1>
      <p className={styles.sub}>
        Signed in as <span className="mono">{user?.email}</span>
        {me && <span className={styles.ok}> · server-verified ✓</span>}
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardHead}>Orders</h2>
        <p className={styles.empty}>No orders yet. Pick a service to send your first task.</p>
        <div className={styles.quick}>
          {CATEGORIES.flatMap((c) => c.offers).map((o) => (
            <Link key={o.slug} to={`/checkout?offer=${o.slug}`} className={styles.quickItem} viewTransition>
              {o.name} <span className="mono lime">${o.price}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
