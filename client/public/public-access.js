// Native keyboard scrolling for code/table panes, including content added by a
// React route. Only overflowing panes enter the tab sequence.
(() => {
  // Standalone pages share the site's saved preference. Sourcey also uses a
  // class for its existing dark styles and keeps its own toggle working.
  if (!document.getElementById("root")) {
    const root = document.documentElement;
    let saved;
    try { saved = localStorage.getItem("sdd-theme"); } catch { /* storage is optional */ }
    const theme = saved === "dark" || saved === "drafting" ? saved
      : root.classList.contains("dark") ? "dark" : "drafting";
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "dark" ? "dark" : "light";
    if (document.body.id === "sourcey") {
      try { localStorage.setItem("sourcey-theme", theme === "dark" ? "dark" : "light"); } catch { /* storage is optional */ }
      root.classList.toggle("dark", theme === "dark");
      new MutationObserver(() => {
        const next = root.classList.contains("dark") ? "dark" : "drafting";
        root.dataset.theme = next;
        root.style.colorScheme = next === "dark" ? "dark" : "light";
        try { localStorage.setItem("sdd-theme", next); } catch { /* storage is optional */ }
      }).observe(root, { attributes: true, attributeFilter: ["class"] });
    } else root.dataset.standalone = "";
  }
  const watched = new WeakSet();
  const receive = (element) => {
    if (element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1) return;
    if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
    if (!element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")) {
      element.setAttribute("aria-label", element.tagName === "PRE" ? "Code example" : "Scrollable table");
    }
    if (!element.hasAttribute("role")) element.setAttribute("role", "region");
  };
  const resize = new ResizeObserver(entries => entries.forEach(({ target }) => receive(target)));
  let scheduled = false;
  const scan = () => {
    scheduled = false;
    document.querySelectorAll('pre, [class*="tableWrap"], [class*="table-wrap"], [class*="overflow-x-auto"]').forEach(element => {
      if (!watched.has(element)) { watched.add(element); resize.observe(element); }
      receive(element);
    });
  };
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(scan); }
  }).observe(document.body, { childList: true, subtree: true });
  scan();
  // The generated documentation search hides its input on Escape. Return
  // keyboard focus to the control that opened it before the input disappears.
  const search = document.getElementById("search-dialog");
  if (search) {
    const triggers = [...document.querySelectorAll("#search-open, #search-open-mobile")];
    let opener = null;
    const visibleTrigger = () => triggers.find(element => element.getClientRects().length);
    const remember = () => {
      const active = document.activeElement;
      opener = active && active !== document.body && active.getClientRects().length ? active : visibleTrigger();
    };
    const restore = () => requestAnimationFrame(() => {
      if (search.classList.contains("open")) return;
      const target = opener?.getClientRects().length ? opener : visibleTrigger();
      target?.focus();
    });
    triggers.forEach(trigger => {
      trigger.setAttribute("aria-controls", "search-dialog");
      trigger.setAttribute("aria-haspopup", "dialog");
    });
    const reflect = () => triggers.forEach(trigger => trigger.setAttribute("aria-expanded", String(search.classList.contains("open"))));
    new MutationObserver(reflect).observe(search, { attributes: true, attributeFilter: ["class"] });
    reflect();
    document.addEventListener("click", event => {
      if (triggers.some(trigger => trigger.contains(event.target))) remember();
      else if (event.target === search && search.classList.contains("open")) restore();
    }, true);
    document.addEventListener("keydown", event => {
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if (!editing && (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k"))) remember();
      if (event.key === "Escape" && search.classList.contains("open")) restore();
    }, true);
  }
  if (!document.getElementById("root")) {
    void fetch("/api/pulse/journey", { method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_viewed", props: { path: location.pathname } }),
    }).catch(() => undefined);
  }
})();
