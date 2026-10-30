import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Clock3,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  MapPin,
  BriefcaseBusiness,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import api from "../../services/api";
import { RatingSummary } from "../../components/StarRating";

const filters = [
  { label: "All Mechanics", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const statusStyles = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-green-50 text-green-800 ring-green-200",
  rejected: "bg-red-50 text-red-800 ring-red-200",
};

function StatCard({ label, value, description, icon: Icon }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
          <Icon size={22} />
        </div>
      </div>
    </section>
  );
}

export default function AdminMechanics() {
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const loadMechanics = useCallback(async () => {
    try {
      const response = await api.get("/admin/mechanics");
      setError("");
      setMechanics(response.data.mechanics || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load mechanic profiles.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadMechanics, 0);

    return () => clearTimeout(timer);
  }, [loadMechanics]);

  const handleVerification = async (mechanic, status) => {
    const account =
      mechanic.userId && typeof mechanic.userId === "object"
        ? mechanic.userId
        : {};

    const mechanicName = account.name || "this mechanic";

    const confirmed = window.confirm(
      `Are you sure you want to ${status} the profile of ${mechanicName}?`,
    );

    if (!confirmed) return;

    setUpdatingId(mechanic._id);
    setActionError("");
    setActionMessage("");

    try {
      const response = await api.patch(
        `/admin/mechanics/${mechanic._id}/verification`,
        { status },
      );

      setActionMessage(
        response.data.message || `Mechanic profile ${status} successfully.`,
      );

      await loadMechanics();
    } catch (err) {
      setActionError(
        err.response?.data?.message ||
          `Unable to ${status} this mechanic. Please try again.`,
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const counts = useMemo(() => {
    return {
      total: mechanics.length,
      pending: mechanics.filter((item) => item.verificationStatus === "pending")
        .length,
      approved: mechanics.filter(
        (item) => item.verificationStatus === "approved",
      ).length,
      rejected: mechanics.filter(
        (item) => item.verificationStatus === "rejected",
      ).length,
    };
  }, [mechanics]);

  const visibleMechanics = useMemo(() => {
    const query = search.trim().toLowerCase();

    return mechanics.filter((mechanic) => {
      const account =
        mechanic.userId && typeof mechanic.userId === "object"
          ? mechanic.userId
          : {};

      const matchesStatus =
        activeFilter === "all" ||
        (mechanic.verificationStatus || "pending") === activeFilter;

      const searchableText = [
        account.name,
        account.email,
        account.phone,
        mechanic.serviceArea,
        ...(mechanic.services || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && searchableText.includes(query);
    });
  }, [mechanics, activeFilter, search]);

  return (
    <div>

      <div>
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            Administration
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Mechanics
          </h1>
          <p className="mt-2 text-slate-600">
            Review mechanic registrations, approve or reject profiles, and see availability.
          </p>
        </div>

        {actionError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {actionError}
          </div>
        )}

        {actionMessage && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {actionMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3 text-red-800">
              <AlertCircle size={21} className="mt-0.5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>

            <button
              type="button"
              onClick={loadMechanics}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 sm:self-auto"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Mechanics"
            value={loading ? "—" : counts.total}
            description="All registered mechanic profiles"
            icon={Users}
          />

          <StatCard
            label="Pending Review"
            value={loading ? "—" : counts.pending}
            description="Awaiting admin verification"
            icon={Clock3}
          />

          <StatCard
            label="Approved"
            value={loading ? "—" : counts.approved}
            description="Profiles approved by admin"
            icon={CheckCircle2}
          />

          <StatCard
            label="Rejected"
            value={loading ? "—" : counts.rejected}
            description="Profiles not approved"
            icon={XCircle}
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Mechanic Registrations
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review professional details and verification status.
                </p>
              </div>

              <button
                type="button"
                onClick={loadMechanics}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      activeFilter === filter.value
                        ? "bg-blue-700 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full lg:max-w-xs">
                <Search
                  size={18}
                  className="absolute left-3 top-3 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search mechanics..."
                  aria-label="Search mechanic profiles"
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-slate-600">
              <LoaderCircle size={23} className="animate-spin" />
              Loading mechanic profiles...
            </div>
          ) : visibleMechanics.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={38} className="mx-auto mb-3 text-slate-300" />
              <h3 className="font-semibold text-slate-800">
                No mechanics found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Try a different filter or search term.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {visibleMechanics.map((mechanic) => {
                const account =
                  mechanic.userId && typeof mechanic.userId === "object"
                    ? mechanic.userId
                    : {};

                const status = mechanic.verificationStatus || "pending";

                return (
                  <article
                    key={mechanic._id}
                    className="p-5 transition hover:bg-slate-50 sm:p-6"
                  >
                    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                      <div className="flex min-w-0 gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <Wrench size={23} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="wrap-break-word text-base font-bold text-slate-900">
                              {account.name || "Unknown account"}
                            </h3>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
                                statusStyles[status] ||
                                "bg-slate-100 text-slate-700 ring-slate-200"
                              }`}
                            >
                              {status}
                            </span>
                          </div>

                          <p className="mt-1 break-all text-sm text-slate-500">
                            {account.email || "No email available"}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin size={15} />
                              {mechanic.serviceArea || "Area not provided"}
                            </span>

                            <span className="inline-flex items-center gap-1.5">
                              <BriefcaseBusiness size={15} />
                              {mechanic.experienceYears ?? 0} years experience
                            </span>

                            {account.phone && (
                              <span className="inline-flex items-center gap-1.5">
                                <ShieldCheck size={15} />
                                {account.phone}
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {(mechanic.services || []).map((service) => (
                              <span
                                key={service}
                                className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800"
                              >
                                {service}
                              </span>
                            ))}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                            <span>
                              Availability:{" "}
                              <strong className={mechanic.isAvailable ? "text-green-700" : "text-slate-700"}>
                                {mechanic.isAvailable ? "Available" : "Unavailable"}
                              </strong>
                            </span>
                            <RatingSummary
                              average={mechanic.ratingAverage}
                              count={mechanic.ratingCount || 0}
                            />
                          </div>

                          {mechanic.bio && (
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                              {mechanic.bio}
                            </p>
                          )}

                          <p className="mt-3 text-xs text-slate-400">
                            Registered{" "}
                            {mechanic.createdAt
                              ? new Date(
                                  mechanic.createdAt,
                                ).toLocaleDateString()
                              : "date unavailable"}
                          </p>

                          {status === "pending" && (
                            <div className="mt-5 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  handleVerification(mechanic, "approved")
                                }
                                disabled={updatingId !== null}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {updatingId === mechanic._id ? (
                                  <LoaderCircle
                                    size={17}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <CheckCircle2 size={17} />
                                )}

                                {updatingId === mechanic._id
                                  ? "Processing..."
                                  : "Approve Mechanic"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleVerification(mechanic, "rejected")
                                }
                                disabled={updatingId !== null}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <XCircle size={17} />
                                Reject Mechanic
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && (
            <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-500">
              Showing {visibleMechanics.length} of {mechanics.length} profiles
            </footer>
          )}
        </section>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <p>
            <strong>Verification reminder:</strong> Review each mechanic's
            professional details before making a decision. Approve profiles that
            meet your requirements or reject profiles that do not. Only
            authorized administrators can access the verification APIs.
          </p>
        </div>
      </div>
    </div>
  );
}
