import { Navigate, Outlet } from "react-router-dom";
import useAuth from "../context/useAuth";
import { getHomePath } from "../utils/roleRoutes";

export default function AdminOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <p className="p-6 text-slate-600">Checking administrator access...</p>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to={getHomePath(user)} replace />;
  }

  return <Outlet />;
}
