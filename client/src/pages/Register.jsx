import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../context/useAuth";
import RegisterRoleTabs from "../components/RegisterRoleTabs";
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      await register(form);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.message || "Registration failed. Please try again.",
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
        <RegisterRoleTabs active="customer" />

        <div>
          <p className="font-bold text-blue-700">RoadSafe</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Create your customer account
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Get help when your vehicle breaks down.
          </p>
        </div>

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
          name="name"
          aria-label="Full name"
          placeholder="Full name"
          value={form.name}
          onChange={handleChange}
          required
        />

        <input
          className={inputClass}
          type="email"
          name="email"
          aria-label="Email address"
          placeholder="Email address"
          value={form.email}
          onChange={handleChange}
          required
        />

        <input
          className={inputClass}
          type="tel"
          name="phone"
          aria-label="Phone number"
          placeholder="Phone number"
          value={form.phone}
          onChange={handleChange}
          required
        />

        <input
          className={inputClass}
          type="password"
          name="password"
          aria-label="Password"
          placeholder="Password (minimum 8 characters)"
          value={form.password}
          onChange={handleChange}
          minLength={8}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-700 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Register"}
        </button>

        <p className="text-center text-sm text-slate-600">
          Are you a mechanic?{" "}
          <Link to="/mechanic/register" className="font-semibold text-blue-700">
            Register as Mechanic
          </Link>
          <br />
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-blue-700">
            Login
          </Link>
        </p>
      </form>
    </main>
  );
}
