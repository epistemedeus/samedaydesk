import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { initialPublicPage, publicPages } from "./public-pages";

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
