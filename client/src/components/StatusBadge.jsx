import { formatStatus, statusStyles } from "../utils/format";

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block w-fit rounded-full px-3 py-1 text-sm font-semibold ${
        statusStyles[status] || "bg-slate-100 text-slate-700"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}
