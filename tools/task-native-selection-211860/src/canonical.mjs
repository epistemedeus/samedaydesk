import { createHash } from "node:crypto";

export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export function sha256(value) {
  const text = typeof value === "string" ? value : canonical(value);
  return createHash("sha256").update(text).digest("hex");
}

export function decimalZero(amount) {
  return amount === "0" || /^0\.0+$/.test(amount);
}
