import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { apiError } from "../../utils/format";

function Stat({ label, value, loading, to }) {
  const body = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{loading ? "—" : value}</p>
    </>
  );
  const cls = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  return to ? (
    <Link to={to} className={`${cls} block hover:border-blue-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// Every figure below comes from GET /api/admin/overview (live database counts).
export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get("/admin/overview");
      setError("");
      setStats(response.data.stats);
    } catch (err) {
      setError(apiError(err, "Unable to load statistics."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);

    return () => clearTimeout(timer);
  }, [load]);

  const v = (key) => stats?.[key] ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Administration</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Overview</h1>
        <p className="mt-2 text-slate-600">Platform statistics calculated from live data.</p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
          <button type="button" onClick={load} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-bold text-slate-900">People</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total customers" value={v("totalCustomers")} loading={loading} to="/admin/customers" />
          <Stat label="Total mechanics" value={v("totalMechanics")} loading={loading} to="/admin/mechanics" />
          <Stat label="Pending verifications" value={v("pendingMechanics")} loading={loading} to="/admin/mechanics" />
          <Stat label="Approved mechanics" value={v("approvedMechanics")} loading={loading} to="/admin/mechanics" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-bold text-slate-900">Service requests</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Total requests" value={v("totalRequests")} loading={loading} to="/admin/requests" />
          <Stat label="Pending" value={v("pendingRequests")} loading={loading} to="/admin/requests" />
          <Stat label="Accepted" value={v("acceptedRequests")} loading={loading} to="/admin/requests" />
          <Stat label="In progress" value={v("inProgressRequests")} loading={loading} to="/admin/requests" />
          <Stat label="Completed" value={v("completedRequests")} loading={loading} to="/admin/requests" />
          <Stat label="Cancelled" value={v("cancelledRequests")} loading={loading} to="/admin/requests" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-bold text-slate-900">Trust</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Customer reviews submitted" value={v("totalReviews")} loading={loading} />
          <Stat label="Invoices issued" value={v("totalInvoices")} loading={loading} />
        </div>
      </section>
    </div>
  );
}
