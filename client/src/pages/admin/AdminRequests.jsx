import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import api from "../../services/api";
import StatusBadge from "../../components/StatusBadge";
import { REQUEST_STATUSES, SERVICE_TYPES } from "../../constants";
import {
  apiError,
  formatCurrency,
  formatDate,
  formatStatus,
  formatVehicle,
  hasCoordinates,
} from "../../utils/format";

const PAGE_SIZE = 20;

// Read-only history of all requests across all customers, including the
// assigned mechanic (USER account + separate MECHANIC profile, joined by the API).
export default function AdminRequests() {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [status, setStatus] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get("/admin/service-requests", {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(status && { status }),
          ...(serviceType && { serviceType }),
          ...(search && { search }),
        },
      });

      setError("");
      setRequests(response.data.serviceRequests || []);
      setPagination({
        page: response.data.page,
        totalPages: response.data.totalPages,
        total: response.data.total,
      });
    } catch (err) {
      setError(apiError(err, "Unable to load service requests."));
    } finally {
      setLoading(false);
    }
  }, [page, status, serviceType, search]);

  useEffect(() => {
    const timer = setTimeout(load, 0);

    return () => clearTimeout(timer);
  }, [load]);

  const changeFilter = (setter) => (event) => {
    setLoading(true);
    setPage(1);
    setter(event.target.value);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSearch(searchInput.trim());
  };

  const field = "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Administration</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Service Requests</h1>
          <p className="mt-2 text-slate-600">
            All roadside requests across customers, with the assigned mechanic.
            {` ${pagination.total} found.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <form onSubmit={submitSearch} className="relative flex-1">
          <Search size={18} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search request ID, customer, mechanic or address"
            aria-label="Search service requests"
            className={`${field} w-full pl-10`}
          />
        </form>

        <select aria-label="Filter by status" value={status} onChange={changeFilter(setStatus)} className={field}>
          <option value="">All statuses</option>
          {REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {formatStatus(value)}
            </option>
          ))}
        </select>

        <select aria-label="Filter by service type" value={serviceType} onChange={changeFilter(setServiceType)} className={field}>
          <option value="">All service types</option>
          {SERVICE_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
          <button type="button" onClick={load} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="p-8 text-center text-slate-600">Loading service requests...</p>
      ) : requests.length === 0 && !error ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">
          No service requests match these filters.
        </p>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const customer = request.customerId && typeof request.customerId === "object" ? request.customerId : null;
            const mechanic = request.mechanicId && typeof request.mechanicId === "object" ? request.mechanicId : null;
            const profile = request.mechanicProfile;

            return (
              <article key={request._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-xs text-slate-500">Request ID: {request._id}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{request.serviceType}</h2>
                    <p className="text-sm text-slate-600">{formatVehicle(request.vehicleId)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>

                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <p className="font-semibold text-slate-700">Customer</p>
                    <p className="text-slate-600">{customer?.name || "Unknown"}</p>
                    {customer?.phone && <p className="text-slate-500">{customer.phone}</p>}
                    {customer?.email && <p className="break-all text-slate-500">{customer.email}</p>}
                  </div>

                  <div>
                    <p className="font-semibold text-slate-700">Assigned mechanic</p>
                    {mechanic ? (
                      <>
                        <p className="text-slate-600">{mechanic.name}</p>
                        {mechanic.phone && <p className="text-slate-500">{mechanic.phone}</p>}
                        {mechanic.email && <p className="break-all text-slate-500">{mechanic.email}</p>}
                        {profile ? (
                          <p className="text-xs text-slate-500">
                            {profile.experienceYears} yrs · {profile.serviceArea} · {profile.verificationStatus}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700">Mechanic profile record not found</p>
                        )}
                      </>
                    ) : (
                      <p className="text-slate-500">No mechanic assigned</p>
                    )}
                  </div>

                  <div>
                    <p className="font-semibold text-slate-700">Location</p>
                    <p className="text-slate-600">{request.location?.address || "Not available"}</p>
                    {hasCoordinates(request.location) && (
                      <p className="text-xs text-slate-500">
                        {request.location.latitude.toFixed(5)}, {request.location.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Problem: </span>
                  {request.problemDescription}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                  <span>Created {formatDate(request.createdAt)}</span>
                  <span>Updated {formatDate(request.updatedAt)}</span>
                  {request.status === "completed" && (
                    <span>Completed {formatDate(request.completedAt, "time not recorded")}</span>
                  )}
                  <span className="ml-auto flex gap-4 text-sm font-semibold">
                    <Link to={`/admin/requests/${request._id}`} className="text-blue-700 hover:underline">
                      Details
                    </Link>
                    {request.invoice && (
                      <Link to={`/admin/invoices/${request.invoice._id}`} className="text-blue-700 hover:underline">
                        Invoice {request.invoice.invoiceNumber} (
                        {formatCurrency(request.invoice.totalAmount, request.invoice.currency)})
                      </Link>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => {
              setLoading(true);
              setPage((p) => p - 1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => {
              setLoading(true);
              setPage((p) => p + 1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
