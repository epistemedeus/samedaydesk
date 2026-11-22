import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { checkoutLoginPath } from "../lib/authHandoff";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="route-loading" aria-busy="true" aria-label="Loading" />;
  if (!user) {
    const login = checkoutLoginPath(location.pathname, location.search);
    return <Navigate to={login} replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
