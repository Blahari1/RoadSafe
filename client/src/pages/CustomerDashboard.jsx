import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CarFront,
  CheckCircle2,
  Clock3,
  Siren,
  History,
  LifeBuoy,
  MapPin,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useAuth from "../context/useAuth";
import api from "../services/api";
import StatusBadge from "../components/StatusBadge";
import useRealtimeRefresh from "../hooks/useRealtimeRefresh";
import { formatDate } from "../utils/format";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [vehicleCount, setVehicleCount] = useState(0);
  const [vehicleCountLoading, setVehicleCountLoading] = useState(true);
  const [vehicleCountError, setVehicleCountError] = useState("");

  const [requestCounts, setRequestCounts] = useState({
    active: 0,
    completed: 0,
  });
  const [requestCountsLoading, setRequestCountsLoading] = useState(true);
  const [requestCountsError, setRequestCountsError] = useState("");

  const [requests, setRequests] = useState([]);

  // Counts and activity are derived from the customer's own service requests.
  const fetchRequests = useCallback(async () => {
    try {
      const response = await api.get("/service-requests");
      const list = response.data.serviceRequests || [];

      setRequests(list);
      setRequestCounts({
        active: list.filter((request) =>
          ["pending", "accepted", "in_progress"].includes(request.status),
        ).length,
        completed: list.filter((request) => request.status === "completed").length,
      });
      setRequestCountsError("");
    } catch {
      setRequestCountsError("Unable to load request counts");
    } finally {
      setRequestCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(fetchRequests, 0);

    return () => clearTimeout(timer);
  }, [fetchRequests]);

  useRealtimeRefresh(fetchRequests);

  const activeRequest = requests.find((request) =>
    ["pending", "accepted", "in_progress"].includes(request.status),
  );
  const recentRequests = requests.slice(0, 3);

  useEffect(() => {
    let cancelled = false;

    const fetchVehicleCount = async () => {
      try {
        const response = await api.get("/vehicles");

        if (!cancelled) {
          setVehicleCount((response.data.vehicles || []).length);
          setVehicleCountError("");
        }
      } catch {
        if (!cancelled) {
          setVehicleCountError("Unable to load vehicle count");
        }
      } finally {
        if (!cancelled) {
          setVehicleCountLoading(false);
        }
      }
    };

    fetchVehicleCount();

    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = user?.name?.trim().split(/\s+/)[0] || "Customer";

  const stats = [
    {
      label: "My Vehicles",
      value: vehicleCountLoading
        ? "..."
        : vehicleCountError
          ? "—"
          : String(vehicleCount),
      description: vehicleCountError || "Registered vehicles",
      icon: CarFront,
      style: "bg-blue-50 text-blue-700",
    },
    {
      label: "Active Requests",
      value: requestCountsLoading
        ? "..."
        : requestCountsError
          ? "—"
          : String(requestCounts.active),
      description:
        requestCountsError || "Pending, accepted or in progress",
      icon: Activity,
      style: "bg-amber-50 text-amber-700",
    },
    {
      label: "Completed Services",
      value: requestCountsLoading
        ? "..."
        : requestCountsError
          ? "—"
          : String(requestCounts.completed),
      description: requestCountsError || "Completed services",
      icon: CheckCircle2,
      style: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold text-blue-700">
          YOUR ROADSAFE OVERVIEW
        </p>

        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          Hello, {firstName}!
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
          Manage your vehicles and access roadside assistance from one place.
        </p>
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-blue-800 p-6 text-white sm:p-9">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium">
            <LifeBuoy size={15} />
            Roadside support
          </span>

          <h2 className="mt-5 text-2xl font-bold sm:text-4xl">
            Vehicle trouble? We’re here to help.
          </h2>

          <p className="mt-3 text-sm leading-6 text-blue-100 sm:text-base">
            Send a short request with your location. Approved, available
            mechanics who offer the service you need can accept it, and you will
            see its status here. Response times are not guaranteed.
          </p>

          <button
            type="button"
            onClick={() => navigate("/request-assistance")}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-4 text-base font-bold text-white shadow-lg hover:bg-red-700 sm:w-auto"
          >
            <Siren size={20} />
            Request Emergency Assistance
            <ArrowRight size={18} />
          </button>
        </div>

        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full border-32px border-white/10" />
      </section>

      {activeRequest && (
        <section
          aria-label="Active request"
          className="rounded-2xl border border-blue-200 bg-blue-50 p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-800">Your active request</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{activeRequest.serviceType}</p>
              <p className="mt-1 text-sm text-slate-700">
                {activeRequest.mechanicId && typeof activeRequest.mechanicId === "object"
                  ? `Mechanic: ${activeRequest.mechanicId.name}${activeRequest.mechanicId.phone ? ` · ${activeRequest.mechanicId.phone}` : ""}`
                  : "Waiting for a mechanic to accept."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={activeRequest.status} />
              <Link
                to={`/service-history/${activeRequest._id}`}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                View status
              </Link>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-bold text-slate-900">Your overview</h2>

        <p className="mt-1 text-sm text-slate-500">
          A summary of your vehicles and service requests.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{stat.label}</p>

                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {stat.value}
                    </p>
                  </div>

                  <span className={`rounded-xl p-3 ${stat.style}`}>
                    <Icon size={22} />
                  </span>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  {stat.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-slate-900">Quick actions</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate("/vehicles")}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 hover:bg-blue-50"
          >
            <CarFront size={25} className="text-blue-700" />

            <span className="flex-1">
              <span className="block font-semibold">Manage vehicles</span>
              <span className="mt-1 block text-sm text-slate-500">
                View your registered vehicles
              </span>
            </span>

            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            onClick={() => navigate("/nearby-mechanics")}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 hover:bg-blue-50"
          >
            <MapPin size={25} className="text-emerald-700" />

            <span className="flex-1">
              <span className="block font-semibold">Find mechanics</span>
              <span className="mt-1 block text-sm text-slate-500">
                Explore nearby mechanic services
              </span>
            </span>

            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            onClick={() => navigate("/service-history")}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 hover:bg-blue-50"
          >
            <History size={25} className="text-violet-700" />

            <span className="flex-1">
              <span className="block font-semibold">Service history</span>
              <span className="mt-1 block text-sm text-slate-500">
                Review previous services
              </span>
            </span>

            <ArrowRight size={18} />
          </button>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <Clock3 size={25} className="text-slate-500" />
              <p className="font-semibold">Recent activity</p>
            </div>

            {recentRequests.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No service activity to display yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recentRequests.map((request) => (
                  <li key={request._id}>
                    <Link
                      to={`/service-history/${request._id}`}
                      className="flex items-center justify-between gap-2 text-sm hover:underline"
                    >
                      <span className="text-slate-700">
                        {request.serviceType}
                        <span className="block text-xs text-slate-500">
                          {formatDate(request.createdAt)}
                        </span>
                      </span>
                      <StatusBadge status={request.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
