import { useState } from "react";
import api from "../services/api";
import { apiError } from "../utils/format";
import { StarInput } from "./StarRating";

const MAX_LENGTH = 500;

// Customer review of a completed service. The server decides who may review
// and rejects duplicates; this form only validates input for faster feedback.
export default function ReviewForm({ requestId, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting) return;

    setError("");

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setError("Please choose a rating from 1 to 5 stars.");
      return;
    }

    if (comment.trim().length > MAX_LENGTH) {
      setError(`Your review must not exceed ${MAX_LENGTH} characters.`);
      return;
    }

    try {
      setSubmitting(true);

      await api.post(`/service-requests/${requestId}/review`, {
        rating,
        comment: comment.trim(),
      });

      onSubmitted();
    } catch (err) {
      setError(apiError(err, "Unable to save your review. Please try again."));
      // A duplicate-review error means a review exists: refresh to show it.
      if (err.response?.status === 409) onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-700">
          How was the service? *
        </p>
        <StarInput value={rating} onChange={setRating} disabled={submitting} />
      </div>

      <div>
        <label
          htmlFor="review-comment"
          className="mb-1 block text-sm font-semibold text-slate-700"
        >
          Written review (optional)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          disabled={submitting}
          placeholder="Tell others about the mechanic's help."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
        <p className="mt-1 text-right text-xs text-slate-500">
          {comment.length}/{MAX_LENGTH}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {submitting ? "Saving review..." : "Submit review"}
      </button>
      <p className="text-xs text-slate-500">
        A review can be submitted once and cannot be edited afterwards.
      </p>
    </form>
  );
}
