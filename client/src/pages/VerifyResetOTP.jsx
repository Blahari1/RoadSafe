import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import AuthShell from "../components/AuthShell";
import { apiError } from "../utils/format";

const OTP_LENGTH = 6;

// Step 2: enter the emailed code. The email arrives via router state (kept in
// memory/history only; nothing is written to localStorage or sessionStorage).
export default function VerifyResetOTP() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(location.state?.cooldown ?? 60);

  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);

    return () => clearTimeout(timer);
  }, [cooldown]);

  // Opened directly without an email: start from the beginning.
  if (!email) {
    return <Navigate to="/forgot-password" replace />;
  }

  const handleVerify = async (event) => {
    event.preventDefault();

    if (loading) return;

    setError("");
    setInfo("");

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/verify-reset-otp", { email, otp });

      // The one-time reset token travels only in router state, in memory.
      navigate("/reset-password", {
        replace: true,
        state: { resetToken: response.data.resetToken },
      });
    } catch (err) {
      setError(apiError(err, "Unable to verify the code. Please try again."));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setError("");
    setInfo("");
    setResending(true);

    try {
      await api.post("/auth/forgot-password", { email });

      setInfo("If your account exists, a new code is on its way. Older codes no longer work.");
      setOtp("");
      setCooldown(60);
    } catch (err) {
      setError(apiError(err, "Unable to resend the code. Please try again."));

      const wait = err.response?.data?.retryAfterSeconds;
      if (err.response?.status === 429 && Number.isFinite(wait)) setCooldown(wait);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title="Enter your code"
      subtitle={`We sent a 6-digit code to ${email} if an account exists. It expires in 5 minutes.`}
      onSubmit={handleVerify}
    >
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {info && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {info}
        </p>
      )}

      <input
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-blue-600"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        aria-label="6-digit verification code"
        placeholder="------"
        maxLength={OTP_LENGTH}
        value={otp}
        onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        disabled={loading}
        required
      />

      <button
        type="submit"
        disabled={loading || otp.length !== OTP_LENGTH}
        className="w-full rounded-lg bg-blue-700 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Verifying..." : "Verify code"}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {resending
            ? "Sending..."
            : cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Resend code"}
        </button>

        <button
          type="button"
          onClick={() => navigate("/forgot-password")}
          className="text-slate-600 hover:underline"
        >
          Use a different email
        </button>
      </div>
    </AuthShell>
  );
}
