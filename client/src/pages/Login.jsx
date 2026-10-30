import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Wrench } from "lucide-react";
import useAuth from "../context/useAuth";
import { getHomePath, isPathAllowedForRole } from "../utils/roleRoutes";

export default function Login() {
  const location = useLocation();
  const savedPath = location.state?.from?.pathname;
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(email, password);
      const role = data.user?.role;

      // Honour the saved destination only if this role may open it.
      // Customer -> /dashboard, approved mechanic -> /mechanic/requests,
      // admin -> /admin (pending/rejected mechanics -> their status page).
      const destination = isPathAllowedForRole(role, savedPath)
        ? savedPath
        : getHomePath(data.user);

      navigate(destination, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message || "Login failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-lg"
      >
        <div>
          <p className="font-bold text-blue-700">RoadSafe</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Login to access your RoadSafe account.
          </p>
        </div>

        {location.state?.passwordReset && !error && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-800"
          >
            Your password has been reset. Log in with your new password.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <input
          className={inputClass}
          type="email"
          aria-label="Email address"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <input
          className={inputClass}
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <div className="-mt-2 text-right">
          <Link
            to="/forgot-password"
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            Forgot Password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-700 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <div className="space-y-3 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
          <p>
            New to RoadSafe?{" "}
            <Link to="/register" className="font-semibold text-blue-700">
              Register as Customer
            </Link>
          </p>

          <Link
            to="/mechanic/register"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-700 px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Wrench size={17} />
            Register as Mechanic
          </Link>
        </div>
      </form>
    </main>
  );
}
