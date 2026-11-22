import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import StubPage from "./pages/StubPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DraftingFrame from "./components/DraftingFrame";
import DraftingCrosshair from "./components/DraftingCrosshair";
import ScrollToHash from "./components/ScrollToHash";
import { AuthProvider } from "./lib/auth";
import { initAnalytics } from "./lib/posthog";
import { journey, observeBrowserErrors } from "./lib/journey";
import { useSmoothScroll } from "./motion/useSmoothScroll";
import { publicPages, type InitialPublicPage } from "./public-pages";
// The buy page is where money moves, so it ships with the main bundle rather than as a later chunk.
import { BuyCare, CareReceipt } from "./pages/Care";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Receipts = lazy(() => import("./pages/Receipts"));
const ReceiptPage = lazy(() => import("./pages/ReceiptPage"));

export default function App({ initialPage }: { initialPage?: InitialPublicPage }) {
  const { pathname } = useLocation();
  useEffect(() => { journey("page_viewed"); }, [pathname]);
  useEffect(observeBrowserErrors, []);
  useEffect(() => {
    performance.mark("sdd:react-ready");
    initAnalytics();
  }, []);
  useSmoothScroll();

  const routes = (
    <Routes>
      {publicPages.map(({ path, page }) => {
        const Page = initialPage?.path === path ? initialPage.Page : page;
        return <Route key={path} path={path} element={<Page />} />;
      })}
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
      <Route path="/care/buy" element={<BuyCare />} />
      <Route path="/care/intake" element={<CareReceipt mode="intake" />} />
      <Route path="/care/subscription" element={<CareReceipt mode="cancel" />} />
      <Route path="/receipts" element={<Receipts />} />
      <Route path="/receipts/:id" element={<ReceiptPage />} />
      <Route path="*" element={<StubPage title="Not found" note="That page doesn't exist." notFound />} />
    </Routes>
  );

  return (
    <AuthProvider>
      <DraftingFrame />
      <DraftingCrosshair />
      <ScrollToHash />
      {/* The build and browser preload this page. Hydrate it with its providers,
          before effects like the theme preference can change shared state. */}
      {initialPage?.path === pathname ? routes : (
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>{routes}</Suspense>
      )}
    </AuthProvider>
  );
}
