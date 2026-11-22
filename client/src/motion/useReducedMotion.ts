import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
};
const snapshot = () => window.matchMedia(query).matches;

// Keep active enhancements in sync when the reading preference changes.
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
