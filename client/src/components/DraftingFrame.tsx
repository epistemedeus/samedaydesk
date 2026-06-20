import { useTheme } from "../lib/theme";
import styles from "./DraftingFrame.module.css";

// Decorative registration / crop marks at the four viewport corners. Present only under the
// "Drafting Table" theme, where they read as a technical drawing pinned to the table.
export default function DraftingFrame() {
  const { theme } = useTheme();
  if (theme !== "drafting") return null;
  return (
    <div className={styles.frame} aria-hidden="true">
      <span className={`${styles.mark} ${styles.tl}`} />
      <span className={`${styles.mark} ${styles.tr}`} />
      <span className={`${styles.mark} ${styles.bl}`} />
      <span className={`${styles.mark} ${styles.br}`} />
    </div>
  );
}
