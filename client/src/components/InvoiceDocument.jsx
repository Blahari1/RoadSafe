import { LifeBuoy } from "lucide-react";
import { formatCurrency, formatDate, formatDay } from "../utils/format";

// Print-friendly invoice. Everything shown comes from the stored invoice
// snapshot; nothing is invented. Payment is NOT recorded by RoadSafe.
export default function InvoiceDocument({ invoice }) {
  const s = invoice.snapshot || {};
  const hasCoordinates =
    Number.isFinite(s.latitude) && Number.isFinite(s.longitude);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white">
            <LifeBuoy size={24} />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-900">RoadSafe</p>
            <p className="text-xs text-slate-500">Roadside assistance</p>
          </div>
        </div>

        <div className="sm:text-right">
          <h1 className="text-2xl font-bold text-slate-900">Invoice</h1>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {invoice.invoiceNumber}
          </p>
          <p className="text-sm text-slate-600">
            Issued: {formatDay(invoice.issuedAt)}
          </p>
        </div>
      </header>

      <section className="grid gap-6 py-6 text-sm sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Billed to
          </h2>
          <p className="mt-2 font-semibold text-slate-900">
            {s.customerName || "Customer"}
          </p>
          {s.customerPhone && <p className="text-slate-600">{s.customerPhone}</p>}
          {s.customerEmail && (
            <p className="break-words text-slate-600">{s.customerEmail}</p>
          )}
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Service provided by
          </h2>
          {s.mechanicName ? (
            <>
              <p className="mt-2 font-semibold text-slate-900">{s.mechanicName}</p>
              {s.mechanicPhone && <p className="text-slate-600">{s.mechanicPhone}</p>}
            </>
          ) : (
            <p className="mt-2 text-slate-600">Mechanic details not available</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 print:bg-white print:p-0">
        <div>
          <p className="font-semibold text-slate-700">Request ID</p>
          <p className="break-all text-slate-600">{invoice.requestId}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Service type</p>
          <p className="text-slate-600">{s.serviceType || "Not available"}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Vehicle</p>
          <p className="text-slate-600">{s.vehicle || "Not available"}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Completion status</p>
          <p className="text-slate-600">
            Completed on {formatDate(s.completedAt)}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="font-semibold text-slate-700">Service location</p>
          <p className="text-slate-600">{s.address || "Not available"}</p>
          {hasCoordinates && (
            <p className="text-xs text-slate-500">
              Coordinates: {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-800">{item.description}</td>
                <td className="py-3 text-right text-slate-800">
                  {formatCurrency(item.amount, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 text-right font-bold text-slate-900">Total</td>
              <td className="pt-4 text-right text-lg font-bold text-slate-900">
                {formatCurrency(invoice.totalAmount, invoice.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {invoice.notes && (
        <p className="mt-5 whitespace-pre-wrap text-sm text-slate-600">
          <span className="font-semibold text-slate-700">Notes: </span>
          {invoice.notes}
        </p>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <p>
          <span className="font-semibold">Payment status:</span> Not recorded.{" "}
          {invoice.paymentNote}
        </p>
        <p className="mt-1">
          Charges were entered by the assigned mechanic; RoadSafe does not set
          service prices.
        </p>
      </footer>
    </article>
  );
}
