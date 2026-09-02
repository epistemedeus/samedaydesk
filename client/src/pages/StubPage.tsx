import { useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./StubPage.module.css";

export default function StubPage({
  title,
  note,
  notFound = false,
}: {
  title: string;
  note?: string;
  notFound?: boolean;
}) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = notFound ? "Not found | SameDayDesk" : `${title} | SameDayDesk`;
    const existing = document.querySelector("meta[name=\"robots\"]");
    const created = !existing && notFound;
    const node = existing ?? (notFound ? document.createElement("meta") : null);
    const prevRobots = existing?.getAttribute("content") ?? null;
    if (notFound && node) {
      node.setAttribute("name", "robots");
      node.setAttribute("content", "noindex");
      if (created) document.head.appendChild(node);
    }
    return () => {
      document.title = prevTitle;
      if (created) node?.remove();
      else if (prevRobots !== null) existing?.setAttribute("content", prevRobots);
    };
  }, [title, notFound]);

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
