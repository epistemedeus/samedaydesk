export const REFUSED_FLAGS = Object.freeze([
  "live",
  "pay",
  "payment",
  "checkout",
  "publish",
  "registry",
  "refresh",
  "settle",
  "neo",
]);

export function refusedFlag(argv) {
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2).split("=")[0].toLowerCase();
    if (REFUSED_FLAGS.includes(name)) return `--${name}`;
  }
  return null;
}
