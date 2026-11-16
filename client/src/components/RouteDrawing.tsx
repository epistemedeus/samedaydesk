import styles from "./RouteDrawing.module.css";

// The paid route as the sheet's schematic: the same four records the field
// log below plays back, numbered so each node on the drawing matches a frame.
const NODES = [
  { n: 1, who: "Agent", what: "Request" },
  { n: 2, who: "Gateway", what: "402" },
  { n: 3, who: "Agent", what: "Payment" },
  { n: 4, who: "Gateway", what: "200 OK" },
] as const;
const LINKS = ["GET", "PAYS", "SETTLES"] as const;

const W = 120;
const H = 56;
const X0 = 12;
const GAP = 46;
const Y = 44;
const xs = NODES.map((_, i) => X0 + i * (W + GAP));
const VW = X0 * 2 + NODES.length * W + (NODES.length - 1) * GAP;
const VH = 236;
const DIM_Y = 156;

export default function RouteDrawing() {
  return (
    <svg
      className={styles.drawing}
      viewBox={`0 0 ${VW} ${VH}`}
      role="img"
      aria-label="The paid route: agent request, gateway 402 payment required, agent payment, gateway 200 OK with receipt"
    >
      {/* centerlines through each node */}
      {xs.map((x) => (
        <line key={`c${x}`} className={styles.center} x1={x + W / 2} y1={Y - 22} x2={x + W / 2} y2={Y + H + 22} />
      ))}
      {/* connectors with the real payload names */}
      {LINKS.map((label, i) => {
        const x1 = xs[i] + W;
        const x2 = xs[i + 1];
        const mid = (x1 + x2) / 2;
        return (
          <g key={label}>
            <line className={styles.link} x1={x1} y1={Y + H / 2} x2={x2} y2={Y + H / 2} />
            <path className={styles.arrow} d={`M ${x2 - 7} ${Y + H / 2 - 4} L ${x2} ${Y + H / 2} L ${x2 - 7} ${Y + H / 2 + 4}`} />
            <text className={styles.linklabel} x={mid} y={Y + H / 2 - 8} textAnchor="middle">{label}</text>
          </g>
        );
      })}
      {/* the nodes */}
      {NODES.map((node, i) => (
        <g key={node.n}>
          <rect className={node.n === 2 ? styles.nodeHot : styles.node} x={xs[i]} y={Y} width={W} height={H} />
          <text className={styles.who} x={xs[i] + W / 2} y={Y + 21} textAnchor="middle">{node.who}</text>
          <text className={node.n === 2 ? styles.whatHot : styles.what} x={xs[i] + W / 2} y={Y + 41} textAnchor="middle">{node.what}</text>
          <circle className={styles.pin} cx={xs[i]} cy={Y} r="9" />
          <text className={styles.pintext} x={xs[i]} y={Y + 3.5} textAnchor="middle">{node.n}</text>
        </g>
      ))}
      {/* dimension line across the whole route */}
      <g aria-hidden="true">
        <line className={styles.dim} x1={X0} y1={DIM_Y - 8} x2={X0} y2={DIM_Y + 8} />
        <line className={styles.dim} x1={VW - X0} y1={DIM_Y - 8} x2={VW - X0} y2={DIM_Y + 8} />
        <line className={styles.dim} x1={X0} y1={DIM_Y} x2={VW - X0} y2={DIM_Y} />
        <text className={styles.dimlabel} x={VW / 2} y={DIM_Y + 22} textAnchor="middle">one paid request</text>
      </g>
    </svg>
  );
}
