import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Star } from "lucide-react";
import api from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { StarDisplay } from "../components/StarRating";
import useRealtimeRefresh from "../hooks/useRealtimeRefresh";
import { REQUEST_STATUSES } from "../constants";
import {
  apiError,
  formatCurrency,
  formatDate,
  formatStatus,
  formatVehicle,
} from "../utils/format";

export default function ServiceHistory() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [filter, setFilter] = useState("all");

  const loadRequests = useCallback(async () => {
    try {
      const response = await api.get("/service-requests");
      setError("");
      setRequests(response.data.serviceRequests || []);
    } catch (err) {
      setError(apiError(err, "Unable to load service history. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadRequests, 0);

    return () => clearTimeout(timer);
  }, [loadRequests]);

  useRealtimeRefresh(loadRequests);

  const cancelRequest = async (id) => {
    if (cancellingId) return;

    const confirmed = window.confirm(
      "Cancel this request? A mechanic will no longer be able to accept it. This cannot be undone.",
    );

    if (!confirmed) return;

    try {
      setCancellingId(id);
      setError("");

      await api.patch(`/service-requests/${id}/cancel`);
    } catch (err) {
      setError(apiError(err, "Unable to cancel this request. Please try again."));
    } finally {
      // Reload from the server to show the latest status either way.
      await loadRequests();
      setCancellingId("");
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Loading your service history...</div>;
  }

  const visible =
    filter === "all" ? requests : requests.filter((request) => request.status === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Service History</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your roadside assistance requests, mechanics, reviews and invoices.
          </p>
        </div>

        <Link
          to="/request-assistance"
          className="rounded-lg bg-blue-700 px-5 py-3 text-center font-semibold text-white hover:bg-blue-800"
        >
          + New request
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
          <button type="button" onClick={loadRequests} className="ml-3 font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {requests.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="status-filter" className="text-sm font-semibold text-slate-700">
            Show
          </label>
          <select
            id="status-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All requests ({requests.length})</option>
            {REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)} (
                {requests.filter((request) => request.status === status).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {!error && requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">No service requests yet</h2>
          <p className="mt-2 text-slate-600">Your submitted assistance requests will appear here.</p>
          <Link
            to="/request-assistance"
            className="mt-5 inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
          >
            Request assistance
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">
          No requests with this status.
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((request) => {
            const mechanic =
              request.mechanicId && typeof request.mechanicId === "object"
                ? request.mechanicId
                : null;

            return (
              <article
                key={request._id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-xs text-slate-500">Request ID: {request._id}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{request.serviceType}</h2>
                    <p className="mt-1 text-sm text-slate-600">{formatVehicle(request.vehicleId)}</p>
                  </div>

                  <StatusBadge status={request.status} />
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-semibold text-slate-700">Location</p>
                    <p className="mt-1 text-slate-600">{request.location?.address || "Not available"}</p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-700">Requested on</p>
                    <p className="mt-1 text-slate-600">{formatDate(request.createdAt)}</p>
                  </div>
                </div>

                {mechanic ? (
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
                    <p className="font-semibold text-slate-800">Assigned mechanic</p>
                    <p className="mt-1 text-slate-700">
                      {mechanic.name}
                      {mechanic.phone ? ` · ${mechanic.phone}` : ""}
                    </p>
                  </div>
                ) : (
                  request.status === "pending" && (
                    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      Waiting for a mechanic to accept your request.
                    </p>
                  )
                )}

                {request.status === "completed" && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    {request.review ? (
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        Your review: <StarDisplay value={request.review.rating} />
                      </span>
                    ) : (
                      <Link
                        to={`/service-history/${request._id}`}
                        className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline"
                      >
                        <Star size={15} /> Not reviewed yet — rate this service
                      </Link>
                    )}

                    {request.invoice && (
                      <Link
                        to={`/invoices/${request.invoice._id}`}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        <FileText size={15} />
                        Invoice {request.invoice.invoiceNumber} (
                        {formatCurrency(request.invoice.totalAmount, request.invoice.currency)})
                      </Link>
                    )}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                  <Link
                    to={`/service-history/${request._id}`}
                    className="rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    View details
                  </Link>

                  {request.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancelRequest(request._id)}
                      disabled={Boolean(cancellingId)}
                      className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {cancellingId === request._id ? "Cancelling..." : "Cancel request"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
