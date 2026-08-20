import styles from "./StubPage.module.css";

export default function StubPage({ title, note }: { title: string; note?: string }) {
  return (
    <main className={styles.wrap}>
      <a href="/" className={styles.back}>
        <span aria-hidden>&#9656;&#9656;</span> SameDayDesk
      </a>
      <h1 className={styles.h1}>{title}</h1>
      {note && <p className={styles.note}>{note}</p>}
      <a href="/" className={styles.home}>Back to the homepage</a>
    </main>
  );
}
