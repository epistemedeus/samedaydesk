import { Suspense, lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import StubPage from "./pages/StubPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DraftingFrame from "./components/DraftingFrame";
import ScrollToHash from "./components/ScrollToHash";
import { AuthProvider } from "./lib/auth";
import { initAnalytics } from "./lib/posthog";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Checkout = lazy(() => import("./pages/Checkout"));
const AiReadiness = lazy(() => import("./pages/AiReadiness"));
const Mcp = lazy(() => import("./pages/Mcp"));
const ForAgents = lazy(() => import("./pages/ForAgents"));
const RecordRepeat = lazy(() => import("./pages/RecordRepeat"));
const DistributionRepair = lazy(() => import("./pages/DistributionRepair"));
const ConsumerRepeat = lazy(() => import("./pages/ConsumerRepeat"));
const UsefulJobs = lazy(() => import("./pages/UsefulJobs"));
const SellerConformance = lazy(() => import("./pages/SellerConformance"));
const VerifiedRoutes = lazy(() => import("./pages/VerifiedRoutes"));
const CompanyPage = lazy(() => import("./pages/CompanyPage"));

export default function App() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <AuthProvider>
      <DraftingFrame />
      <ScrollToHash />
      <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/tools/ai-readiness" element={<AiReadiness />} />
          <Route path="/x402" element={<Mcp />} />
          <Route path="/x402/seller-conformance" element={<SellerConformance />} />
          <Route path="/x402/verified" element={<VerifiedRoutes />} />
          <Route path="/for-agents" element={<ForAgents />} />
          <Route path="/for-agents/record-repeat" element={<RecordRepeat />} />
          <Route path="/for-agents/distribution-repair" element={<DistributionRepair />} />
          <Route path="/for-agents/consumer-repeat" element={<ConsumerRepeat />} />
          <Route path="/for-agents/useful-jobs" element={<UsefulJobs />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/terms" element={<StubPage title="Terms of Service" note="Legal copy coming soon." />} />
          <Route path="/privacy" element={<StubPage title="Privacy Policy" note="Legal copy coming soon." />} />
          <Route path="/company" element={<CompanyPage kind="about" />} />
          <Route path="/security" element={<CompanyPage kind="security" />} />
          <Route path="/changelog" element={<CompanyPage kind="changelog" />} />
          <Route path="*" element={<StubPage title="404" note="Nothing is served at this address. The response, as an agent would read it:" notFound />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
