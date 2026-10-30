import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import api from "../services/api";
import useAuth from "../context/useAuth";
import InvoiceDocument from "../components/InvoiceDocument";
import { apiError } from "../utils/format";

const BACK_LINKS = {
  customer: { to: "/service-history", label: "Back to Service History" },
  mechanic: { to: "/mechanic/requests", label: "Back to Requests" },
  admin: { to: "/admin/requests", label: "Back to Service Requests" },
};

// One invoice page for all roles. The backend decides who may see which
// invoice (owner customer, assigned mechanic, or admin).
export default function InvoicePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const back = BACK_LINKS[user?.role] || BACK_LINKS.customer;

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInvoice = useCallback(async () => {
    try {
      const response = await api.get(`/invoices/${id}`);
      setError("");
      setInvoice(response.data.invoice);
    } catch (err) {
      setError(apiError(err, "Unable to load this invoice."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(loadInvoice, 0);

    return () => clearTimeout(timer);
  }, [loadInvoice]);

  if (loading) {
    return <p className="p-6 text-slate-600">Loading invoice...</p>;
  }

  if (error || !invoice) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">
          {error || "Invoice not found."}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadInvoice();
          }}
          className="mr-4 font-semibold text-blue-700 underline"
        >
          Retry
        </button>
        <Link to={back.to} className="font-semibold text-blue-700 underline">
          {back.label}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to={back.to} className="text-sm font-semibold text-blue-700 hover:underline">
          ← {back.label}
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <Printer size={16} />
          Print / Save as PDF
        </button>
      </div>

      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
