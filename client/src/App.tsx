import { Suspense, lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import StubPage from "./pages/StubPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/auth";
import { initAnalytics } from "./lib/posthog";
import { useSmoothScroll } from "./motion/useSmoothScroll";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Checkout = lazy(() => import("./pages/Checkout"));

export default function App() {
  useEffect(() => {
    initAnalytics();
  }, []);
  useSmoothScroll();

  return (
    <AuthProvider>
      <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/terms" element={<StubPage title="Terms of Service" note="Legal copy coming soon." />} />
          <Route path="/privacy" element={<StubPage title="Privacy Policy" note="Legal copy coming soon." />} />
          <Route path="*" element={<StubPage title="Not found" note="That page doesn't exist." />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
