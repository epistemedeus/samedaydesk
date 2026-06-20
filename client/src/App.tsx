import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import StubPage from "./pages/StubPage";
import { initAnalytics } from "./lib/posthog";
import { useSmoothScroll } from "./motion/useSmoothScroll";

export default function App() {
  useEffect(() => {
    initAnalytics();
  }, []);
  useSmoothScroll();

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<StubPage title="Sign in" note="Accounts arrive in the next build phase." />} />
      <Route path="/signup" element={<StubPage title="Create your account" note="Accounts arrive in the next build phase." />} />
      <Route path="/dashboard" element={<StubPage title="Your desk" note="Coming with auth." />} />
      <Route path="/checkout" element={<StubPage title="Checkout" note="Coming with payments." />} />
      <Route path="/terms" element={<StubPage title="Terms of Service" note="Legal copy coming soon." />} />
      <Route path="/privacy" element={<StubPage title="Privacy Policy" note="Legal copy coming soon." />} />
      <Route path="*" element={<StubPage title="Not found" note="That page doesn't exist." />} />
    </Routes>
  );
}
