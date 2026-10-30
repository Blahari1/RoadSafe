import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import RealtimeNotifications from "../components/RealtimeNotifications";
import NotificationCenter from "../components/NotificationCenter";
import {
  CarFront,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import useAuth from "../context/useAuth";

const navigation = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "My Vehicles", path: "/vehicles", icon: CarFront },
  {
    label: "Request Assistance",
    path: "/request-assistance",
    icon: LifeBuoy,
  },
  {
    label: "Nearby Mechanics",
    path: "/nearby-mechanics",
    icon: MapPin,
  },
  {
    label: "Service History",
    path: "/service-history",
    icon: History,
  },
  { label: "My Profile", path: "/profile", icon: UserRound },
];

export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const firstName = user?.name?.trim().split(/\s+/)[0] || "Customer";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

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
            <p className="text-xs text-slate-500">Roadside assistance</p>
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

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
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
            <h3 className="mt-3 font-semibold text-slate-900">
              Drive with confidence
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Your roadside assistance hub.
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
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-8 print:hidden">
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
              <p className="text-sm text-slate-500">Customer portal</p>
              <p className="text-lg font-bold text-slate-900">RoadSafe</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationCenter />

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">
                {firstName}
              </p>
              <p className="text-xs text-slate-500">Customer</p>
            </div>
          </div>
        </header>

        <div className="print:hidden">
          <RealtimeNotifications />
        </div>
        <main className="mx-auto max-w-7xl p-4 sm:p-8 print:p-0">
          <Outlet />
        </main>

        <footer className="px-6 py-5 text-center text-xs text-slate-500 print:hidden">
          © {new Date().getFullYear()} RoadSafe. Roadside assistance made
          simpler.
        </footer>
      </div>
    </div>
  );
}
