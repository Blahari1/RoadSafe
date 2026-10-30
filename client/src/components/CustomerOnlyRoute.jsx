import { Navigate, Outlet } from "react-router-dom";
import useAuth from "../context/useAuth";
import { getHomePath } from "../utils/roleRoutes";

export default function CustomerOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="p-6 text-slate-600">Checking account...</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "customer") {
    return <Navigate to={getHomePath(user)} replace />;
  }

  return <Outlet />;
}
