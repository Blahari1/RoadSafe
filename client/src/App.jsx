import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import useAuth from "./context/useAuth";
import { getHomePath } from "./utils/roleRoutes";
import ProtectedRoute from "./components/ProtectedRoute";
import MechanicOnlyRoute from "./components/MechanicOnlyRoute";
import CustomerOnlyRoute from "./components/CustomerOnlyRoute";
import AdminOnlyRoute from "./components/AdminOnlyRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import MechanicRegister from "./pages/MechanicRegister";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyResetOTP from "./pages/VerifyResetOTP";
import ResetPassword from "./pages/ResetPassword";
import InvoicePage from "./pages/InvoicePage";

import CustomerLayout from "./layouts/CustomerLayout";
import CustomerDashboard from "./pages/CustomerDashboard";
import MyVehicles from "./pages/MyVehicles";
import RequestAssistance from "./pages/RequestAssistance";
import NearbyMechanics from "./pages/NearbyMechanics";
import ServiceHistory from "./pages/ServiceHistory";
import ServiceRequestDetails from "./pages/ServiceRequestDetails";
import MyProfile from "./pages/MyProfile";

import MechanicLayout from "./layouts/MechanicLayout";
import MechanicProfile from "./pages/MechanicProfile";
import MechanicRequests from "./pages/MechanicRequests";
import MechanicVerification from "./pages/MechanicVerification";

import AdminLayout from "./layouts/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminMechanics from "./pages/admin/AdminMechanics";
import AdminRequests from "./pages/admin/AdminRequests";
import AdminRequestDetails from "./pages/admin/AdminRequestDetails";
import AdminCustomers from "./pages/admin/AdminCustomers";

// Sends a logged-in user to their role's landing page.
function RoleRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="p-6 text-slate-600">Checking your session...</p>;
  }

  return <Navigate to={user ? getHomePath(user) : "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/mechanic/register" element={<MechanicRegister />} />

          {/* Password recovery: public, no role redirects */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-reset-otp" element={<VerifyResetOTP />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            {/* Admin routes */}
            <Route element={<AdminOnlyRoute />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/mechanics" element={<AdminMechanics />} />
                <Route path="/admin/requests" element={<AdminRequests />} />
                <Route path="/admin/requests/:id" element={<AdminRequestDetails />} />
                <Route path="/admin/invoices/:id" element={<InvoicePage />} />
                <Route path="/admin/customers" element={<AdminCustomers />} />
              </Route>
            </Route>

            {/* Mechanic routes */}
            <Route element={<MechanicOnlyRoute />}>
              <Route element={<MechanicLayout />}>
                <Route path="/mechanic/verification" element={<MechanicVerification />} />
                <Route path="/mechanic/profile" element={<MechanicProfile />} />
                <Route path="/mechanic/requests" element={<MechanicRequests />} />
                <Route path="/mechanic/invoices/:id" element={<InvoicePage />} />
              </Route>
            </Route>

            {/* Customer routes */}
            <Route element={<CustomerOnlyRoute />}>
              <Route element={<CustomerLayout />}>
                <Route path="/dashboard" element={<CustomerDashboard />} />
                <Route path="/vehicles" element={<MyVehicles />} />
                <Route path="/request-assistance" element={<RequestAssistance />} />
                <Route path="/nearby-mechanics" element={<NearbyMechanics />} />
                <Route path="/service-history" element={<ServiceHistory />} />
                <Route path="/service-history/:id" element={<ServiceRequestDetails />} />
                <Route path="/invoices/:id" element={<InvoicePage />} />
                <Route path="/profile" element={<MyProfile />} />
              </Route>
            </Route>
          </Route>

          {/* Default and unknown routes */}
          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
