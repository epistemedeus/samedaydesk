import { Suspense, lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import StubPage from "./pages/StubPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DraftingFrame from "./components/DraftingFrame";
import ScrollToHash from "./components/ScrollToHash";
import { AuthProvider } from "./lib/auth";
import { initAnalytics } from "./lib/posthog";
import { useSmoothScroll } from "./motion/useSmoothScroll";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Checkout = lazy(() => import("./pages/Checkout"));
const AiReadiness = lazy(() => import("./pages/AiReadiness"));
const Mcp = lazy(() => import("./pages/Mcp"));

export default function App() {
  useEffect(() => {
    initAnalytics();
  }, []);
  useSmoothScroll();

  return (
    <AuthProvider>
      <DraftingFrame />
      <ScrollToHash />
      <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
        <Routes>
          <Route path="/tools/ai-readiness" element={<AiReadiness />} />
          <Route path="/x402" element={<Mcp />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/privacy" element={<StubPage title="Privacy" note="We store what you send us to deliver the work you bought, and nothing else. Questions: contact@samedaydesk.com." />} />
          <Route path="*" element={<StubPage title="Not found" note="That page does not exist." />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
