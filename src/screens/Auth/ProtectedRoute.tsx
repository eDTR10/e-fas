import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Loader from "../../components/loader/loader";
import { isPathAllowedForRole } from "../../lib/roleAccess";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <Loader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user && !isPathAllowedForRole(user.role, location.pathname)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
