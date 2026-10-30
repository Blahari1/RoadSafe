import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { FileText, MapPin, Phone } from "lucide-react";
import api from "../services/api";
import StatusBadge from "../components/StatusBadge";
import RequestTimeline from "../components/RequestTimeline";
import ReviewForm from "../components/ReviewForm";
import { RatingSummary, StarDisplay } from "../components/StarRating";
import useRealtimeRefresh from "../hooks/useRealtimeRefresh";
import {
  apiError,
  formatCurrency,
  formatDate,
  formatVehicle,
  hasCoordinates,
  mapLink,
} from "../utils/format";

// Pending requests: show approved, available mechanics near the breakdown.
// Distances are approximate straight-line values, not ETAs.
function NearbyForRequest({ request }) {
  const [mechanics, setMechanics] = useState(null);
  const [failed, setFailed] = useState(false);

  const lat = request.location?.latitude;
  const lng = request.location?.longitude;
  const serviceType = request.serviceType;
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!hasPin) return undefined;

    let cancelled = false;

    api
      .get("/mechanics/nearby", { params: { lat, lng, serviceType } })
      .then((response) => {
        if (!cancelled) setMechanics(response.data.mechanics || []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hasPin, lat, lng, serviceType]);

  if (!hasPin) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-bold text-slate-900">Mechanics available near you</h2>
      <p className="mt-1 text-xs text-slate-500">
        Approved mechanics who are available and offer {serviceType}. Distances
        are approximate straight-line distances within the platform service radius. Availability does
        not guarantee that a mechanic will accept or a response time.
      </p>

      {failed ? (
        <p className="mt-3 text-sm text-slate-600">Could not load nearby mechanics right now.</p>
      ) : mechanics === null ? (
        <p className="mt-3 text-sm text-slate-600">Looking for nearby mechanics...</p>
      ) : mechanics.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No available mechanics found nearby at the moment. Your request stays
          open and mechanics who match will see it.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {mechanics.slice(0, 5).map((mechanic) => (
            <li key={mechanic._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{mechanic.userId?.name || "Mechanic"}</p>
                <RatingSummary average={mechanic.ratingAverage} count={mechanic.ratingCount} />
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                ≈ {mechanic.distanceKm} km
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ServiceRequestDetails() {
  const { id } = useParams();
  const location = useLocation();
  const justCreated = Boolean(location.state?.justCreated);

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadRequest = useCallback(async () => {
    try {
      const response = await api.get(`/service-requests/${id}`);

      setError("");
      setRequest(response.data.serviceRequest);
    } catch (err) {
      setError(apiError(err, "Unable to load this service request."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadRequest, 0);

    return () => clearTimeout(timer);
  }, [loadRequest]);

  // Live status updates pushed by the server.
  useRealtimeRefresh(loadRequest);

  const cancelRequest = async () => {
    if (cancelling) return;

    if (
      !window.confirm(
        "Cancel this request? A mechanic will no longer be able to accept it. This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      setCancelling(true);
      setError("");

      await api.patch(`/service-requests/${id}/cancel`);
    } catch (err) {
      setError(apiError(err, "Unable to cancel this request."));
    } finally {
      await loadRequest();
      setCancelling(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Loading request details...</div>;
  }

  if (error && !request) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadRequest();
          }}
          className="mr-4 font-semibold text-blue-700 underline"
        >
          Retry
        </button>
        <Link to="/service-history" className="font-semibold text-blue-700 underline">
          Back to Service History
        </Link>
      </div>
    );
  }

  if (!request) {
    return <div className="p-6">Request not found.</div>;
  }

  const mechanic =
    request.mechanicId && typeof request.mechanicId === "object" ? request.mechanicId : null;
  const profile = request.mechanicProfile;
  const link = mapLink(request.location);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/service-history" className="text-sm font-semibold text-blue-700 hover:underline">
        ← Back to Service History
      </Link>

      {justCreated && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Your request has been submitted.</p>
          <p className="mt-1">
            It is now visible to approved, available mechanics who offer this
            service. This page updates automatically when a mechanic responds.
            RoadSafe cannot guarantee a response time.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="break-all text-sm text-slate-500">Request ID: {request._id}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{request.serviceType}</h1>
        <div className="mt-3">
          <StatusBadge status={request.status} />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 space-y-5">
          <section>
            <h2 className="font-semibold text-slate-900">Vehicle</h2>
            <p className="mt-1 text-slate-600">{formatVehicle(request.vehicleId)}</p>
            {request.vehicleId?.vehicleType && (
              <p className="text-sm text-slate-500">Type: {request.vehicleId.vehicleType}</p>
            )}
          </section>

          <section>
            <h2 className="font-semibold text-slate-900">Problem description</h2>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">{request.problemDescription}</p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900">Assistance location</h2>
            <p className="mt-1 flex items-start gap-1 text-slate-600">
              <MapPin size={16} className="mt-1 shrink-0 text-slate-400" />
              {request.location?.address || "Not available"}
            </p>
            {hasCoordinates(request.location) && (
              <p className="mt-1 text-sm text-slate-500">
                {request.location.latitude.toFixed(5)}, {request.location.longitude.toFixed(5)}
                {link && (
                  <>
                    {" · "}
                    <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                      View on map
                    </a>
                  </>
                )}
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-slate-900">Service progress</h2>
            <RequestTimeline request={request} />
            <p className="mt-3 text-xs text-slate-500">
              Last updated: {formatDate(request.updatedAt)}
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900">Assigned mechanic</h2>
            {mechanic ? (
              <div className="mt-2 rounded-xl bg-blue-50 p-4 text-sm text-slate-700">
                <p className="text-base font-semibold text-slate-900">{mechanic.name}</p>
                {mechanic.phone && (
                  <a
                    href={`tel:${mechanic.phone}`}
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                  >
                    <Phone size={14} />
                    {mechanic.phone}
                  </a>
                )}

                {profile && (
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Experience</dt>
                      <dd>
                        {profile.experienceYears} year{profile.experienceYears === 1 ? "" : "s"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Service area</dt>
                      <dd>{profile.serviceArea}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">Services</dt>
                      <dd>{(profile.services || []).join(", ")}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">Admin verification</dt>
                      <dd className="capitalize">{profile.verificationStatus}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">Customer rating</dt>
                      <dd>
                        <RatingSummary average={profile.ratingAverage} count={profile.ratingCount} />
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            ) : (
              <p className="mt-1 text-slate-600">
                {request.status === "cancelled"
                  ? "No mechanic was assigned."
                  : "No mechanic assigned yet."}
              </p>
            )}
          </section>
        </div>

        {request.status === "pending" && (
          <button
            type="button"
            onClick={cancelRequest}
            disabled={cancelling}
            className="mt-7 rounded-lg border border-red-300 px-5 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {cancelling ? "Cancelling..." : "Cancel request"}
          </button>
        )}
      </div>

      {request.status === "pending" && <NearbyForRequest request={request} />}

      {request.status === "completed" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="font-bold text-slate-900">Your review</h2>

          {request.review ? (
            <div className="mt-3">
              <StarDisplay value={request.review.rating} size={22} />
              {request.review.comment && (
                <p className="mt-2 whitespace-pre-wrap text-slate-700">{request.review.comment}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Submitted {formatDate(request.review.createdAt)}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <ReviewForm requestId={request._id} onSubmitted={loadRequest} />
            </div>
          )}
        </section>
      )}

      {request.status === "completed" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="font-bold text-slate-900">Invoice</h2>

          {request.invoice ? (
            <Link
              to={`/invoices/${request.invoice._id}`}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50"
            >
              <FileText size={16} />
              View invoice {request.invoice.invoiceNumber} —{" "}
              {formatCurrency(request.invoice.totalAmount, request.invoice.currency)}
            </Link>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              No invoice has been issued yet. Your mechanic enters the charges
              after completing the job, and you will be notified.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
