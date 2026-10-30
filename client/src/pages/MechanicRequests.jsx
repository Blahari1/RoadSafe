import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Phone, RefreshCw, FileText } from "lucide-react";
import api from "../services/api";
import StatusBadge from "../components/StatusBadge";
import InvoiceForm from "../components/InvoiceForm";
import RequestTimeline from "../components/RequestTimeline";
import { StarDisplay } from "../components/StarRating";
import useRealtimeRefresh from "../hooks/useRealtimeRefresh";
import {
  apiError,
  formatCurrency,
  formatDate,
  formatVehicle,
  hasCoordinates,
  mapLink,
} from "../utils/format";

function RequestCard({
  request,
  mode,
  busy,
  canAccept,
  onAccept,
  onUpdateStatus,
  onInvoiceIssued,
}) {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const customer =
    request.customerId && typeof request.customerId === "object"
      ? request.customerId
      : null;

  const link = mapLink(request.location);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-all text-xs text-slate-500">Request ID: {request._id}</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{request.serviceType}</h3>
          <p className="mt-1 text-sm text-slate-600">{formatVehicle(request.vehicleId)}</p>
        </div>

        <StatusBadge status={request.status} />
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="font-semibold text-slate-700">Customer</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
            {customer?.name || "Customer"}
            {customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
              >
                <Phone size={14} />
                {customer.phone}
              </a>
            )}
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-700">Problem description</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-600">{request.problemDescription}</p>
        </div>

        <div>
          <p className="font-semibold text-slate-700">Location</p>
          <p className="mt-1 flex items-start gap-1 text-slate-600">
            <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
            <span>{request.location?.address || "Not available"}</span>
          </p>
          {hasCoordinates(request.location) && (
            <p className="mt-1 text-xs text-slate-500">
              {request.location.latitude.toFixed(5)}, {request.location.longitude.toFixed(5)}
              {link && (
                <>
                  {" · "}
                  <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                    Open map
                  </a>
                </>
              )}
            </p>
          )}
          {mode === "available" && (
            <p className="mt-1 text-xs text-slate-500">
              {request.distanceKm !== null && request.distanceKm !== undefined
                ? `Approx. ${request.distanceKm} km away (straight-line distance, not driving distance)`
                : "Distance unknown — the customer did not pin a map location."}
            </p>
          )}
        </div>

        <p className="text-xs text-slate-500">Requested {formatDate(request.createdAt)}</p>
      </div>

      {mode === "assigned" && request.review && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">Customer review</p>
          <div className="mt-1">
            <StarDisplay value={request.review.rating} />
          </div>
          {request.review.comment && (
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{request.review.comment}</p>
          )}
        </div>
      )}

      {mode === "assigned" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTimeline((value) => !value)}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            {showTimeline ? "Hide progress" : "Show progress"}
          </button>
          {showTimeline && (
            <div className="mt-3">
              <RequestTimeline request={request} />
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {mode === "available" && (
          <button
            type="button"
            onClick={() => onAccept(request._id)}
            disabled={busy || !canAccept}
            className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Accepting..." : "Accept request"}
          </button>
        )}

        {mode === "assigned" && request.status === "accepted" && (
          <button
            type="button"
            onClick={() => onUpdateStatus(request._id, "in_progress")}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Updating..." : "Start service"}
          </button>
        )}

        {mode === "assigned" && request.status === "in_progress" && (
          <button
            type="button"
            onClick={() => onUpdateStatus(request._id, "completed")}
            disabled={busy}
            className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {busy ? "Updating..." : "Mark completed"}
          </button>
        )}

        {mode === "assigned" && request.status === "completed" && request.invoice && (
          <Link
            to={`/mechanic/invoices/${request.invoice._id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50"
          >
            <FileText size={16} />
            View invoice {request.invoice.invoiceNumber} (
            {formatCurrency(request.invoice.totalAmount, request.invoice.currency)})
          </Link>
        )}

        {mode === "assigned" && request.status === "completed" && !request.invoice && !showInvoiceForm && (
          <button
            type="button"
            onClick={() => setShowInvoiceForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
          >
            <FileText size={16} />
            Create invoice
          </button>
        )}
      </div>

      {mode === "assigned" && request.status === "completed" && !request.invoice && showInvoiceForm && (
        <InvoiceForm
          requestId={request._id}
          onCancel={() => setShowInvoiceForm(false)}
          onIssued={() => {
            setShowInvoiceForm(false);
            onInvoiceIssued();
          }}
        />
      )}
    </article>
  );
}

export default function MechanicRequests() {
  const [availableRequests, setAvailableRequests] = useState([]);
  const [assignedRequests, setAssignedRequests] = useState([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [locationInfo, setLocationInfo] = useState({
    maxRadiusKm: null,
    locationMissing: false,
    hiddenWithoutLocation: 0,
    totalEligible: 0,
    listLimit: 0,
    truncated: false,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      const response = await api.get("/mechanics/requests");

      setError("");
      setIsAvailable(Boolean(response.data.isAvailable));
      setLocationInfo({
        maxRadiusKm: response.data.maxRadiusKm ?? null,
        locationMissing: Boolean(response.data.locationMissing),
        hiddenWithoutLocation: response.data.hiddenWithoutLocation || 0,
        totalEligible: response.data.totalEligible || 0,
        listLimit: response.data.listLimit || 0,
        truncated: Boolean(response.data.truncated),
      });
      setAvailableRequests(response.data.availableRequests || []);
      setAssignedRequests(response.data.assignedRequests || []);
    } catch (err) {
      setError(apiError(err, "Unable to load requests. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadRequests, 0);

    return () => clearTimeout(timer);
  }, [loadRequests]);

  // Live updates: a new matching request, or any change to your jobs.
  useRealtimeRefresh(loadRequests, [
    "service_request_updated",
    "available_requests_changed",
  ]);

  const acceptRequest = async (id) => {
    if (busyId) return;

    try {
      setBusyId(id);
      setError("");
      setNotice("");

      const response = await api.patch(`/mechanics/requests/${id}/accept`);

      setNotice(response.data.message || "Request accepted successfully.");
    } catch (err) {
      setError(apiError(err, "Unable to accept this request."));
    } finally {
      // Always refresh: another mechanic may have taken it first.
      await loadRequests();
      setBusyId("");
    }
  };

  const updateStatus = async (id, status) => {
    if (busyId) return;

    const label = status === "completed" ? "completed" : "started";

    if (!window.confirm(`Mark this job as ${label}? The customer will be notified.`)) {
      return;
    }

    try {
      setBusyId(id);
      setError("");
      setNotice("");

      const response = await api.patch(`/mechanics/requests/${id}/status`, { status });

      setNotice(response.data.message || "Request status updated.");
      await loadRequests();
    } catch (err) {
      setError(apiError(err, "Unable to update request status."));
    } finally {
      setBusyId("");
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Loading requests...</div>;
  }

  const activeJobs = assignedRequests.filter((r) => r.status !== "completed");
  const completedJobs = assignedRequests.filter((r) => r.status === "completed");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">MECHANIC PORTAL</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Requests</h1>
          <p className="mt-1 text-sm text-slate-600">
            Find assistance requests and manage your assigned jobs.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRequests}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <span>{error}</span>
          <button type="button" onClick={loadRequests} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          {notice}
        </div>
      )}

      <section>
        <h2 className="text-xl font-bold text-slate-900">Available requests</h2>
        <p className="mb-4 text-sm text-slate-600">
          Pending requests matching your registered services
          {locationInfo.maxRadiusKm
            ? ` within ${locationInfo.maxRadiusKm} km of your saved location`
            : ""}
          , nearest first. Requests without a pinned location are shown with
          no distance.
        </p>

        {locationInfo.locationMissing && (
          <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You have not saved a service location, so requests with a pinned
            location are hidden
            {locationInfo.hiddenWithoutLocation > 0
              ? ` (${locationInfo.hiddenWithoutLocation} right now)`
              : ""}
            .{" "}
            <Link to="/mechanic/profile" className="font-semibold underline">
              Add your location in your profile
            </Link>
            .
          </div>
        )}

        {locationInfo.truncated && (
          <p role="status" className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Showing the nearest {locationInfo.listLimit} of{" "}
            {locationInfo.totalEligible} eligible requests. Accept or wait for
            some to clear to see the rest.
          </p>
        )}

        {!isAvailable ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            You are currently <strong>unavailable</strong>. Switch on
            “Available” in the top bar to see and accept new requests.
          </div>
        ) : availableRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-600">
            No matching requests are waiting right now. This page updates
            automatically when a new request arrives.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {availableRequests.map((request) => (
              <RequestCard
                key={request._id}
                request={request}
                mode="available"
                busy={busyId === request._id}
                canAccept={isAvailable && !busyId}
                onAccept={acceptRequest}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-slate-900">My active jobs</h2>

        {activeJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-600">
            You have no accepted or in-progress jobs.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeJobs.map((request) => (
              <RequestCard
                key={request._id}
                request={request}
                mode="assigned"
                busy={busyId === request._id}
                onUpdateStatus={updateStatus}
                onInvoiceIssued={loadRequests}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-slate-900">Completed jobs</h2>

        {completedJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-600">
            Completed jobs, invoices and customer reviews appear here.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {completedJobs.map((request) => (
              <RequestCard
                key={request._id}
                request={request}
                mode="assigned"
                busy={busyId === request._id}
                onUpdateStatus={updateStatus}
                onInvoiceIssued={loadRequests}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
