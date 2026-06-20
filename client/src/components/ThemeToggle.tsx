import { useTheme } from "../lib/theme";
import styles from "./ThemeToggle.module.css";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4 8.3 8.3 0 1 0 20 14.4Z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const drafting = theme === "drafting";
  const label = drafting
    ? "Switch to Engineered Speed (dark) theme"
    : "Switch to Drafting Table (light) theme";

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={drafting}
      aria-label={label}
      title={label}
      onClick={(e) => toggle({ x: e.clientX, y: e.clientY })}
    >
      <span className={styles.icon}>{drafting ? <MoonIcon /> : <SunIcon />}</span>
    </button>
  );
}
