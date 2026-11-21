import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/drafting.css";

import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { initialPublicPage, type InitialPublicPage } from "./public-pages";

const root = document.getElementById("root")!;
const path = window.location.pathname;
const marker = document.querySelector('meta[name="sdd-public-first-render"]')?.getAttribute("content");

function application(page?: InitialPublicPage) {
  return <StrictMode>
    <ThemeProvider initialTheme={page ? "drafting" : undefined}>
      <BrowserRouter>
        <App initialPage={page} />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>;
}

if (marker === path && !window.location.search && root.firstChild) {
  void initialPublicPage(path).then((page) => {
    if (page) hydrateRoot(root, application(page));
    else createRoot(root).render(application());
  }).catch((error) => console.error("initial page could not be loaded", error));
} else {
  createRoot(root).render(application());
}
