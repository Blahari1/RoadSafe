import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  LifeBuoy,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import api from "../services/api";
import useAuth from "../context/useAuth";
import RealtimeNotifications from "../components/RealtimeNotifications";
import NotificationCenter from "../components/NotificationCenter";
import { apiError } from "../utils/format";

const navigation = [
  { label: "Requests", path: "/mechanic/requests", icon: ListChecks },
  { label: "My Profile", path: "/mechanic/profile", icon: UserRound },
];

const STATUS_CHIP = {
  pending: {
    label: "Pending approval",
    icon: Clock3,
    style: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    style: "bg-green-50 text-green-800 ring-green-200",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    style: "bg-red-50 text-red-800 ring-red-200",
  },
};

// Pages an unapproved mechanic may open.
const UNAPPROVED_PATHS = ["/mechanic/verification", "/mechanic/profile"];

export default function MechanicLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      const response = await api.get("/mechanics/me");
      setError("");
      setProfile(response.data.mechanic);
    } catch (err) {
      setError(apiError(err, "Unable to load your mechanic account."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadProfile, 0);

    return () => clearTimeout(timer);
  }, [loadProfile]);

  const handleLogout = () => {
    // The auth context clears the token and session and disconnects Socket.IO.
    logout();
    navigate("/login", { replace: true });
  };

  const toggleAvailability = async () => {
    if (!profile || availabilitySaving) return;

    setAvailabilitySaving(true);
    setAvailabilityError("");

    try {
      const response = await api.patch("/mechanics/me/availability", {
        isAvailable: !profile.isAvailable,
      });

      setProfile((previous) => ({
        ...previous,
        isAvailable: response.data.mechanic.isAvailable,
      }));
    } catch (err) {
      setAvailabilityError(apiError(err, "Unable to change availability."));
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const firstName = user?.name?.trim().split(/\s+/)[0] || "Mechanic";
  const status = profile?.verificationStatus;
  const chip = STATUS_CHIP[status];
  const ChipIcon = chip?.icon;
  const isApproved = status === "approved";

  let body;

  if (loading) {
    body = (
      <div className="flex min-h-64 items-center justify-center text-slate-600">
        <LoaderCircle className="animate-spin text-blue-700" size={28} />
        <span className="ml-3">Loading your account...</span>
      </div>
    );
  } else if (error || !profile) {
    body = (
      <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="font-semibold text-red-800">Something went wrong</h1>
        <p className="mt-2 text-sm text-red-700">{error || "Profile unavailable."}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadProfile();
          }}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    );
  } else if (!isApproved && !UNAPPROVED_PATHS.includes(location.pathname)) {
    // Unapproved mechanics see their status page instead of broken pages.
    body = <Navigate to="/mechanic/verification" replace />;
  } else {
    body = <Outlet context={{ profile, refreshProfile: loadProfile }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden print:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 print:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white">
            <LifeBuoy size={23} />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-900">RoadSafe</p>
            <p className="text-xs text-slate-500">Mechanic portal</p>
          </div>

          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-2 hover:bg-slate-100 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Main menu
          </p>

          {navigation.map((item) => {
            const Icon = item.icon;
            // Unapproved mechanics can only open the profile page.
            const disabled = !isApproved && item.path === "/mechanic/requests";

            if (disabled) {
              return (
                <NavLink
                  key={item.path}
                  to="/mechanic/verification"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400"
                >
                  <Icon size={19} />
                  {item.label}
                  <span className="ml-auto text-xs">Locked</span>
                </NavLink>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-700 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <Icon size={19} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4">
          <div className="rounded-2xl bg-blue-50 p-4">
            <ShieldCheck size={23} className="text-blue-700" />
            <h3 className="mt-3 font-semibold text-slate-900">Verified service</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Only admin-approved mechanics can accept roadside requests.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={19} />
            Logout
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-8 print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={22} />
            </button>
            <div>
              <p className="text-sm text-slate-500">Mechanic portal</p>
              <p className="text-lg font-bold text-slate-900">RoadSafe</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <NotificationCenter />
            {chip && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${chip.style}`}
              >
                <ChipIcon size={14} />
                {chip.label}
              </span>
            )}

            {isApproved && (
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(profile.isAvailable)}
                onClick={toggleAvailability}
                disabled={availabilitySaving}
                title="Customers only see you in searches, and you can only accept requests, while available"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <span
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    profile.isAvailable ? "bg-green-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      profile.isAvailable ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
                {profile.isAvailable ? "Available" : "Unavailable"}
              </button>
            )}

            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800">
                {firstName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{firstName}</p>
                <p className="text-xs text-slate-500">Mechanic</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut size={17} />
              Logout
            </button>
          </div>
        </header>

        {availabilityError && (
          <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:mx-8">
            {availabilityError}
          </p>
        )}

        <div className="print:hidden">
          <RealtimeNotifications />
        </div>

        <main className="mx-auto max-w-7xl p-4 sm:p-8 print:p-0">{body}</main>

        <footer className="px-6 py-5 text-center text-xs text-slate-500 print:hidden">
          © RoadSafe. Roadside assistance made simpler.
        </footer>
      </div>
    </div>
  );
}
