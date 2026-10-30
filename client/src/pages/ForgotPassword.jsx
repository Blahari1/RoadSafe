import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import AuthShell from "../components/AuthShell";
import { apiError } from "../utils/format";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step 1: enter the registered email. The server answers identically whether
// or not an account exists, so this page never says which.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const normalized = email.trim().toLowerCase();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    setError("");

    if (!EMAIL_PATTERN.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/auth/forgot-password", { email: normalized });

      navigate("/verify-reset-otp", { state: { email: normalized, cooldown: 60 } });
    } catch (err) {
      setError(
        apiError(err, "Unable to send the code. Check your connection and try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email address you registered with. If an account exists, we will email you a 6-digit code. This works for customer, mechanic and admin accounts."
      onSubmit={handleSubmit}
    >
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <input
        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600"
        type="email"
        aria-label="Registered email address"
        autoComplete="email"
        placeholder="Registered email address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={loading}
        required
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-700 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Sending code..." : "Send verification code"}
      </button>

      {EMAIL_PATTERN.test(normalized) && (
        <p className="text-center text-sm text-slate-600">
          Already have a code?{" "}
          <Link
            to="/verify-reset-otp"
            state={{ email: normalized, cooldown: 0 }}
            className="font-semibold text-blue-700 hover:underline"
          >
            Enter it here
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
