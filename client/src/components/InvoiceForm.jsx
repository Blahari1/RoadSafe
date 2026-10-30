import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import api from "../services/api";
import { apiError, formatCurrency } from "../utils/format";

const MAX_ITEMS = 10;
const emptyItem = () => ({ description: "", amount: "" });

// The assigned mechanic enters the real charges for a completed job.
// The server validates everything again and computes the final total.
export default function InvoiceForm({ requestId, onIssued, onCancel }) {
  const [items, setItems] = useState([emptyItem()]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (index, field, value) =>
    setItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );

  const parsed = items.map((item) => ({
    description: item.description.trim(),
    amount: item.amount === "" ? NaN : Number(item.amount),
  }));

  const total = parsed.reduce(
    (sum, item) => (Number.isFinite(item.amount) ? sum + item.amount : sum),
    0,
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting) return;

    setError("");

    for (const item of parsed) {
      if (!item.description) {
        setError("Every charge needs a description.");
        return;
      }

      if (!Number.isFinite(item.amount) || item.amount < 0) {
        setError("Every charge needs an amount of 0 or more.");
        return;
      }

      if (Math.abs(Math.round(item.amount * 100) - item.amount * 100) > 1e-6) {
        setError("Amounts can have at most 2 decimal places.");
        return;
      }
    }

    if (total <= 0) {
      setError("The invoice total must be greater than zero.");
      return;
    }

    if (
      !window.confirm(
        `Issue this invoice for ${formatCurrency(total)}? Issued invoices cannot be edited.`,
      )
    ) {
      return;
    }

    try {
      setSubmitting(true);

      await api.post(`/invoices/request/${requestId}`, {
        lineItems: parsed,
        notes: notes.trim(),
      });

      onIssued();
    } catch (err) {
      setError(apiError(err, "Unable to issue the invoice. Please try again."));
      if (err.response?.status === 409) onIssued();
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <p className="text-sm font-semibold text-slate-800">Issue invoice</p>
      <p className="text-xs text-slate-600">
        Enter the actual charges for this job. RoadSafe does not set prices and
        does not process payments.
      </p>

      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label={`Charge ${index + 1} description`}
            className={`${inputClass} sm:flex-1`}
            placeholder="Description (e.g. Labour)"
            maxLength={100}
            value={item.description}
            onChange={(event) => updateItem(index, "description", event.target.value)}
          />
          <input
            aria-label={`Charge ${index + 1} amount in rupees`}
            className={`${inputClass} sm:w-36`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Amount (₹)"
            value={item.amount}
            onChange={(event) => updateItem(index, "amount", event.target.value)}
          />
          {items.length > 1 && (
            <button
              type="button"
              aria-label={`Remove charge ${index + 1}`}
              onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-600 hover:bg-white"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}

      {items.length < MAX_ITEMS && (
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
        >
          <Plus size={15} /> Add charge
        </button>
      )}

      <textarea
        aria-label="Invoice notes"
        className={inputClass}
        rows={2}
        maxLength={300}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <p className="text-right text-sm font-bold text-slate-900">
        Total: {formatCurrency(total)}
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {submitting ? "Issuing..." : "Issue invoice"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
