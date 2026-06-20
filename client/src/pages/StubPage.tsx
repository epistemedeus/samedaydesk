import { Link } from "react-router-dom";
import styles from "./StubPage.module.css";

export default function StubPage({ title, note }: { title: string; note?: string }) {
  return (
    <main className={styles.wrap}>
      <Link to="/" className={styles.back} viewTransition>
        <span aria-hidden>▸▸</span> SameDayDesk
      </Link>
      <h1 className={styles.h1}>{title}</h1>
      {note && <p className={styles.note}>{note}</p>}
      <Link to="/" className={styles.home} viewTransition>← Back home</Link>
    </main>
  );
}
