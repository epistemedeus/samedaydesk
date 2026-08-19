import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getSupabase, authedFetch } from "../lib/supabase";
import styles from "./Dashboard.module.css";

type Me = { uid: string; email: string; emailVerified: boolean };
type Order = { id: string; label: string; amount: number; status: string; created_at: string };

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [params] = useSearchParams();
  const justPaid = params.get("paid") === "1";
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    authedFetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    getSupabase().then(async (sb) => {
      if (!sb) return;
      const { data } = await sb.from("orders").select("id,label,amount,status,created_at").order("created_at", { ascending: false });
      setOrders(data ?? []);
    });
  }, []);

  return (
    <main className={styles.wrap}>
      <header className={styles.top}>
        <a href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">&#9656;&#9656;</span> SameDayDesk
        </a>
        <button className={styles.signout} onClick={() => signOut()}>Sign out</button>
      </header>

      {justPaid && <div className={styles.banner}>Payment received. Check your inbox for the intake link; the clock starts when that form is complete.</div>}

      <h1 className={styles.h1}>Your desk</h1>
      <p className={styles.sub}>
        Signed in as <span className="mono">{user?.email}</span>
        {me && <span className={styles.ok}> · server-verified ✓</span>}
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardHead}>Orders</h2>
        {orders && orders.length > 0 ? (
          <ul className={styles.orders}>
            {orders.map((o) => (
              <li key={o.id} className={styles.order}>
                <div>
                  <p className={styles.orderLabel}>{o.label}</p>
                  <p className={styles.orderMeta}>
                    <span className="mono">${(o.amount / 100).toFixed(0)}</span> · {new Date(o.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={styles.status}>{o.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className={styles.empty}>No orders on this account.</p>
            <div className={styles.quick}>
              <a href="/#offers" className={styles.quickItem}>See the current offers</a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
