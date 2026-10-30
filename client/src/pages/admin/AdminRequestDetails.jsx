import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../services/api";
import StatusBadge from "../../components/StatusBadge";
import RequestTimeline from "../../components/RequestTimeline";
import { RatingSummary, StarDisplay } from "../../components/StarRating";
import {
  apiError,
  formatCurrency,
  formatDate,
  formatVehicle,
  hasCoordinates,
  mapLink,
} from "../../utils/format";

function Info({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 text-sm text-slate-700">{children}</div>
    </div>
  );
}

export default function AdminRequestDetails() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/admin/service-requests/${id}`);
      setError("");
      setRequest(response.data.serviceRequest);
    } catch (err) {
      setError(apiError(err, "Unable to load this request."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(load, 0);

    return () => clearTimeout(timer);
  }, [load]);

  if (loading) return <p className="p-6 text-slate-600">Loading request...</p>;

  if (error || !request) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">
          {error || "Request not found."}
        </p>
        <Link to="/admin/requests" className="font-semibold text-blue-700 underline">
          Back to Service Requests
        </Link>
      </div>
    );
  }

  const customer = request.customerId && typeof request.customerId === "object" ? request.customerId : null;
  const mechanic = request.mechanicId && typeof request.mechanicId === "object" ? request.mechanicId : null;
  const profile = request.mechanicProfile;
  const link = mapLink(request.location);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/admin/requests" className="text-sm font-semibold text-blue-700 hover:underline">
        ← Back to Service Requests
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="break-all text-sm text-slate-500">Request ID: {request._id}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{request.serviceType}</h1>
        <div className="mt-3">
          <StatusBadge status={request.status} />
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Info label="Customer">
            <p className="font-semibold">{customer?.name || "Unknown"}</p>
            {customer?.phone && <p>{customer.phone}</p>}
            {customer?.email && <p className="break-all">{customer.email}</p>}
          </Info>

          <Info label="Assigned mechanic">
            {mechanic ? (
              <>
                <p className="font-semibold">{mechanic.name}</p>
                {mechanic.phone && <p>{mechanic.phone}</p>}
                {mechanic.email && <p className="break-all">{mechanic.email}</p>}
                {profile ? (
                  <>
                    <p>
                      {profile.experienceYears} years · {profile.serviceArea}
                    </p>
                    <p>Services: {(profile.services || []).join(", ")}</p>
                    <p className="capitalize">Verification: {profile.verificationStatus}</p>
                    <RatingSummary average={profile.ratingAverage} count={profile.ratingCount} />
                  </>
                ) : (
                  <p className="text-amber-700">Mechanic profile record not found.</p>
                )}
              </>
            ) : (
              <p>No mechanic assigned</p>
            )}
          </Info>

          <Info label="Vehicle">{formatVehicle(request.vehicleId)}</Info>

          <Info label="Location">
            <p>{request.location?.address || "Not available"}</p>
            {hasCoordinates(request.location) && (
              <p className="text-xs text-slate-500">
                {request.location.latitude.toFixed(5)}, {request.location.longitude.toFixed(5)}
                {link && (
                  <>
                    {" · "}
                    <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                      Map
                    </a>
                  </>
                )}
              </p>
            )}
          </Info>

          <div className="md:col-span-2">
            <Info label="Problem description">
              <p className="whitespace-pre-wrap">{request.problemDescription}</p>
            </Info>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-900">Progress</h2>
        <RequestTimeline request={request} />
        <p className="mt-3 text-xs text-slate-500">
          Created {formatDate(request.createdAt)} · Last updated {formatDate(request.updatedAt)}
        </p>
      </section>

      {request.review && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">Customer review</h2>
          <div className="mt-2">
            <StarDisplay value={request.review.rating} size={20} />
          </div>
          {request.review.comment && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{request.review.comment}</p>
          )}
        </section>
      )}

      {request.invoice && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">Invoice</h2>
          <Link
            to={`/admin/invoices/${request.invoice._id}`}
            className="mt-2 inline-block font-semibold text-blue-700 hover:underline"
          >
            {request.invoice.invoiceNumber} —{" "}
            {formatCurrency(request.invoice.totalAmount, request.invoice.currency)}
          </Link>
        </section>
      )}
    </div>
  );
}
