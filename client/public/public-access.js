// Native keyboard scrolling for code/table panes, including content added by a
// React route. Only overflowing panes enter the tab sequence.
(() => {
  const watched = new WeakSet();
  const receive = (element) => {
    if (element.scrollWidth <= element.clientWidth + 1) return;
    if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
    if (!element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")) {
      element.setAttribute("aria-label", element.tagName === "PRE" ? "Code example" : "Scrollable table");
    }
  };
  const resize = new ResizeObserver(entries => entries.forEach(({ target }) => receive(target)));
  let scheduled = false;
  const scan = () => {
    scheduled = false;
    document.querySelectorAll('pre, [class*="tableWrap"], [class*="table-wrap"], [class*="overflow-x-auto"]').forEach(element => {
      if (!watched.has(element)) { watched.add(element); resize.observe(element); receive(element); }
    });
  };
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(scan); }
  }).observe(document.body, { childList: true, subtree: true });
  scan();
  if (!document.getElementById("root")) {
    void fetch("/api/pulse/journey", { method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_viewed", props: { path: location.pathname } }),
    }).catch(() => undefined);
  }
})();
