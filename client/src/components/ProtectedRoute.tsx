import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { accountCheckoutEntry } from "../lib/services";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="route-loading" aria-busy="true" aria-label="Loading" />;
  if (!user) {
    const offer = new URLSearchParams(location.search).get("offer");
    const resume = location.pathname === "/checkout" && accountCheckoutEntry(offer);
    const login = resume ? `/login?offer=${encodeURIComponent(offer!)}&checkout=1` : "/login";
    return <Navigate to={login} replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
