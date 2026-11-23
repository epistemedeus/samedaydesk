import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { initialPublicPage, publicPages } from "./public-pages";
import { ALL_OFFERS, PAYMENT_LINKS } from "./lib/services";

export async function renderPublicPages() {
  const output = [];
  for (const { path, entry } of publicPages) {
    const initialPage = await initialPublicPage(path);
    if (!initialPage) throw new Error(`Missing page: ${path}`);
    const html = renderToString(<StrictMode>
      <ThemeProvider initialTheme="drafting">
        <StaticRouter location={path}>
          <App initialPage={initialPage} />
        </StaticRouter>
      </ThemeProvider>
    </StrictMode>);
    if (!/<main\b[^>]*\bid="main"/.test(html) || html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING")) {
      throw new Error(`Incomplete public render: ${path}`);
    }
    output.push({ path, entry, html });
  }
  return output;
}

// The buy page for each offer sold through it, so the price and button paint with the document.
export function renderBuyPages() {
  return ALL_OFFERS.filter((offer) => PAYMENT_LINKS[offer.slug]?.startsWith("/care/buy?")).map((offer) => {
    const html = renderToString(<StrictMode>
      <ThemeProvider initialTheme="drafting">
        <StaticRouter location={`/care/buy?offer=${offer.slug}`}>
          <App />
        </StaticRouter>
      </ThemeProvider>
    </StrictMode>);
    if (!/<main\b[^>]*\bid="main"/.test(html) || !html.includes(`${offer.price} USD`)) throw new Error(`Incomplete buy render: ${offer.slug}`);
    return { offer: offer.slug, title: `${offer.plain} | SameDayDesk`, html };
  });
}
