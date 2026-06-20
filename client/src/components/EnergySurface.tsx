import styles from "./EnergySurface.module.css";

// The "energy surface" behind the hero. Renders a low-contrast CSS gradient fallback
// immediately (this is what reduced-motion / weak-GPU users see). The OGL/GLSL flow-field
// canvas is layered on top after LCP in a later pass.
export default function EnergySurface() {
  return (
    <div className={styles.surface} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.grid} />
    </div>
  );
}
