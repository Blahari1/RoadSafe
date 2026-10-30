import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import api from "../services/api";
import AuthShell from "../components/AuthShell";
import { apiError } from "../utils/format";

// Mirrors the server rules (the server is the authority).
const validate = (password, confirm) => {
  if (password.length < 8) return "Password must contain at least 8 characters.";
  if (new TextEncoder().encode(password).length > 72) return "Password must not exceed 72 bytes.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  if (password !== confirm) return "Passwords do not match.";
  return "";
};

// Step 3: choose a new password using the one-time token from step 2.
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const resetToken = location.state?.resetToken;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  // Opened directly (no verified code): start from the beginning.
  if (!resetToken) {
    return <Navigate to="/forgot-password" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    setError("");

    const problem = validate(password, confirm);

    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);

    try {
      await api.post("/auth/reset-password", {
        resetToken,
        newPassword: password,
        confirmPassword: confirm,
      });

      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(apiError(err, "Unable to reset the password. Please try again."));

      // The token is spent or expired: the user must start again.
      if (err.response?.status === 400 && /session|expired|start again/i.test(err.response.data?.message || "")) {
        setSessionExpired(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 outline-none focus:border-blue-600";

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use at least 8 characters with a letter and a number."
      onSubmit={handleSubmit}
    >
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          {sessionExpired && (
            <>
              {" "}
              <Link to="/forgot-password" className="font-semibold underline">
                Start again
              </Link>
            </>
          )}
        </p>
      )}

      <div className="relative">
        <input
          className={inputClass}
          type={show ? "text" : "password"}
          aria-label="New password"
          autoComplete="new-password"
          placeholder="New password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          required
        />
        <button
          type="button"
          aria-label={show ? "Hide passwords" : "Show passwords"}
          onClick={() => setShow((value) => !value)}
          className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-800"
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      <input
        className={inputClass}
        type={show ? "text" : "password"}
        aria-label="Confirm new password"
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        disabled={loading}
        required
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-700 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Saving..." : "Reset password"}
      </button>
    </AuthShell>
  );
}
