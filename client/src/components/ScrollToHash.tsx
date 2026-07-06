import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type Lenis from "lenis";

// Height of the fixed header + a small breathing gap, so a scrolled-to
// section isn't hidden underneath the nav.
function headerOffset() {
  const header = document.querySelector("header");
  const h = header instanceof HTMLElement ? header.offsetHeight : 0;
  return h + 16;
}

// Scroll to an element id. Prefer Lenis when it's actually running (it provides
// the smooth animation); if Lenis is absent or inert, fall back to a direct jump.
// Uses the two-arg window.scrollTo because native `behavior:"smooth"` is a no-op
// while Lenis is loaded.
function scrollToId(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
  const before = window.scrollY;
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
  if (lenis && typeof lenis.scrollTo === "function") {
    lenis.scrollTo(target, { duration: 1 });
  }
  // If Lenis didn't start moving the page shortly after, jump there directly.
  window.setTimeout(() => {
    if (Math.abs(window.scrollY - before) < 4 && Math.abs(window.scrollY - target) > 8) {
      window.scrollTo(0, target);
    }
  }, 120);
  return true;
}

// Makes in-page #hash links (footer/nav) actually scroll, including when the link
// is clicked from another route (navigate to "/#how", then scroll once the landing
// section has mounted). Mount once, inside the Router.
export default function ScrollToHash() {
  const { hash, key } = useLocation();

  // Router-driven navigations (<Link to="/#services">).
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      if (scrollToId(id)) return;
      if (tries++ < 40) timer = window.setTimeout(attempt, 16); // wait for the target to mount
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [hash, key]);

  // Safety net for any raw <a href="#x"> that bypasses the router.
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      if (h) scrollToId(decodeURIComponent(h.slice(1)));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return null;
}
