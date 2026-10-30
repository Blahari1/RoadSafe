import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import api from "../../services/api";
import { apiError, formatDay } from "../../utils/format";

const PAGE_SIZE = 20;

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get("/admin/customers", {
        params: { page, limit: PAGE_SIZE, ...(search && { search }) },
      });

      setError("");
      setCustomers(response.data.customers || []);
      setPagination({
        page: response.data.page,
        totalPages: response.data.totalPages,
        total: response.data.total,
      });
    } catch (err) {
      setError(apiError(err, "Unable to load customers."));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = setTimeout(load, 0);

    return () => clearTimeout(timer);
  }, [load]);

  const submitSearch = (event) => {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Administration</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Customers</h1>
          <p className="mt-2 text-slate-600">{pagination.total} registered customers.</p>
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

      <form onSubmit={submitSearch} className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-3 text-slate-400" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search name, email or phone"
          aria-label="Search customers"
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm"
        />
      </form>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
          <button type="button" onClick={load} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="p-8 text-center text-slate-600">Loading customers...</p>
      ) : customers.length === 0 && !error ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">
          No customers found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3 text-right">Vehicles</th>
                <th className="px-4 py-3 text-right">Requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((customer) => (
                <tr key={customer._id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{customer.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p className="break-all">{customer.email}</p>
                    <p>{customer.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDay(customer.createdAt)}</td>
                  <td className="px-4 py-3 text-right">{customer.vehicleCount}</td>
                  <td className="px-4 py-3 text-right">{customer.requestCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
