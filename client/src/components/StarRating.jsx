import { Star } from "lucide-react";

// Read-only stars for a real rating value.
export function StarDisplay({ value, size = 16 }) {
  const rounded = Math.round(value);

  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={
            n <= rounded ? "fill-amber-400 text-amber-400" : "text-slate-300"
          }
        />
      ))}
    </span>
  );
}

// Clickable 1-5 star input, exposed as a radio group for accessibility.
export function StarInput({ value, onChange, disabled = false }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60"
        >
          <Star
            size={32}
            className={
              n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"
            }
          />
        </button>
      ))}
    </div>
  );
}

// "4.5 (12 reviews)" or an honest "No reviews yet" - never an invented rating.
export function RatingSummary({ average, count }) {
  if (!count) {
    return <span className="text-sm text-slate-500">No reviews yet</span>;
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-700">
      <StarDisplay value={average} />
      <span className="font-semibold">{average.toFixed(1)}</span>
      <span className="text-slate-500">
        ({count} review{count === 1 ? "" : "s"})
      </span>
    </span>
  );
}
