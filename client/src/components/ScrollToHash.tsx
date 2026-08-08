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

// Scroll to an element id. Route transitions can mount the target while Lenis is
// still easing from the previous page, so use an immediate destination update.
// This keeps every section aligned under the fixed header instead of sometimes
// stopping a few hundred pixels early.
function scrollToId(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
  if (lenis && typeof lenis.scrollTo === "function") {
    lenis.scrollTo(target, { immediate: true });
  }
  window.scrollTo(0, target);
  return true;
}

// Makes in-page #hash links (footer/nav) actually scroll, including when the link
// is clicked from another route (navigate to "/#how", then scroll once the landing
// section has mounted). Mount once, inside the Router.
export default function ScrollToHash() {
  const { pathname, search, hash, key } = useLocation();

  // React Router preserves the previous page's scroll position by default.
  // Route links such as /x402 and /tools/ai-readiness should always open at
  // their own top instead of inheriting a deep scroll position from the page
  // the visitor just left.
  useEffect(() => {
    if (hash) return;
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    if (lenis && typeof lenis.scrollTo === "function") {
      lenis.scrollTo(0, { immediate: true });
    }
    window.scrollTo(0, 0);
  }, [pathname, search, hash, key]);

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
