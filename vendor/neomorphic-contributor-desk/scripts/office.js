(function () {
  "use strict";

  var html = document.documentElement;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(pointer: fine)").matches;
  var $ = function (selector, context) { return (context || document).querySelector(selector); };
  var $$ = function (selector, context) { return Array.prototype.slice.call((context || document).querySelectorAll(selector)); };

  function initTheme() {
    var button = $("[data-theme-toggle]");
    var media = matchMedia("(prefers-color-scheme: dark)");
    function current() { return html.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
    function apply(theme, persist) {
      html.setAttribute("data-theme", theme);
      if (persist) { try { localStorage.setItem("neo-theme", theme); } catch (error) {} }
      if (button) {
        button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
        button.setAttribute("title", theme === "dark" ? "Light" : "Dark");
      }
      var meta = $("meta[name=theme-color][data-dynamic]");
      if (meta) meta.setAttribute("content", theme === "dark" ? "#0f0f12" : "#F4F0E6");
    }
    apply(current(), false);
    if (button) button.addEventListener("click", function () { apply(current() === "dark" ? "light" : "dark", true); });
    var followSystem = function (event) {
      try { if (localStorage.getItem("neo-theme")) return; } catch (error) {}
      apply(event.matches ? "dark" : "light", false);
    };
    if (media.addEventListener) media.addEventListener("change", followSystem);
    else if (media.addListener) media.addListener(followSystem);
  }

  function initNavigation() {
    var button = $("[data-nav-toggle]");
    var nav = $("[data-office-nav]");
    if (!button || !nav) return;
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      nav.classList.toggle("is-open", !open);
    });
    nav.addEventListener("click", function (event) {
      if (!event.target.closest("a")) return;
      button.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    });
  }

  function initReveals() {
    var items = $$("[data-reveal]");
    if (!items.length || reduced || !("IntersectionObserver" in window)) return;
    items.forEach(function (item) { item.classList.add("will-reveal"); });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (item) { observer.observe(item); });
  }

  function initCopy() {
    $$("[data-copy]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var target = document.getElementById(button.getAttribute("data-copy"));
        if (!target) return;
        var text = target.getAttribute("data-copy-value") || target.textContent || "";
        try {
          await navigator.clipboard.writeText(text.trim());
          var old = button.textContent;
          button.textContent = "Copied";
          setTimeout(function () { button.textContent = old; }, 1400);
        } catch (error) {
          button.textContent = "Select text";
          target.setAttribute("tabindex", "-1");
          target.focus();
        }
      });
    });
  }

  function initCursor() {
    if (!finePointer || reduced) return;
    var dot = $("[data-cursor]");
    if (!dot) return;
    var x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, on = false;
    addEventListener("mousemove", function (event) {
      x = event.clientX; y = event.clientY;
      if (!on) { on = true; cx = x; cy = y; dot.classList.add("is-on"); }
    });
    addEventListener("mouseleave", function () { on = false; dot.classList.remove("is-on"); });
    document.addEventListener("mouseover", function (event) { dot.classList.toggle("is-active", !!event.target.closest("a,button,input,select,textarea")); });
    (function loop() {
      cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
      dot.style.transform = "translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px) translate(-50%,-50%) rotate(45deg)";
      requestAnimationFrame(loop);
    })();
  }

  function boot() {
    initTheme();
    initNavigation();
    initReveals();
    initCopy();
    initCursor();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
