import { createHash } from "node:crypto";
import { DECIMAL_AMOUNT } from "./constants.mjs";

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

export function compareDecimal(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !DECIMAL_AMOUNT.test(left) || !DECIMAL_AMOUNT.test(right)) {
    throw new Error("decimal_incomparable");
  }
  const [leftWhole, leftFrac = ""] = left.split(".");
  const [rightWhole, rightFrac = ""] = right.split(".");
  const scale = Math.max(leftFrac.length, rightFrac.length);
  const leftDigits = `${leftWhole}${leftFrac.padEnd(scale, "0")}`.replace(/^0+/, "") || "0";
  const rightDigits = `${rightWhole}${rightFrac.padEnd(scale, "0")}`.replace(/^0+/, "") || "0";
  if (leftDigits.length !== rightDigits.length) return leftDigits.length < rightDigits.length ? -1 : 1;
  if (leftDigits < rightDigits) return -1;
  if (leftDigits > rightDigits) return 1;
  return 0;
}
