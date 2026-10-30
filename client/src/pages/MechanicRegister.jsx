import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Wrench,
  UserRound,
  Phone,
  Mail,
  LockKeyhole,
  MapPin,
  BriefcaseBusiness,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";

import useAuth from "../context/useAuth";
import RegisterRoleTabs from "../components/RegisterRoleTabs";

const AVAILABLE_SERVICES = [
  "General Repair",
  "Engine Repair",
  "Battery Service",
  "Tyre/Puncture Repair",
  "Towing",
  "Electrical Repair",
  "Oil Change",
  "Brake Repair",
];

const initialForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  experienceYears: "0",
  services: [],
  serviceArea: "",
  bio: "",
};

export default function MechanicRegister() {
  const { registerMechanic } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleServiceChange = (service) => {
    setForm((previous) => ({
      ...previous,
      services: previous.services.includes(service)
        ? previous.services.filter((item) => item !== service)
        : [...previous.services, service],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.services.length === 0) {
      setError("Please select at least one service.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setSubmitting(true);

    try {
      await registerMechanic({
        ...form,
        experienceYears: Number(form.experienceYears),
      });

      setSuccess(true);
    } catch (err) {
      setError(
        err.response?.data?.message || "Registration failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 size={56} className="mx-auto mb-4 text-green-600" />

          <h1 className="text-2xl font-bold text-slate-900">
            Registration Successful!
          </h1>

          <p className="mt-3 text-slate-600">
            Your RoadSafe mechanic account has been created. Your profile is
            awaiting admin verification.
          </p>

          <div className="mt-6 rounded-xl bg-amber-50 p-4 text-left">
            <p className="font-semibold text-amber-800">
              Verification status: Pending
            </p>
            <p className="mt-1 text-sm text-amber-700">
              An admin must review your profile before you can be treated as an
              approved mechanic.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/mechanic/verification")}
            className="mt-6 w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800"
          >
            Continue
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-6 max-w-md">
          <RegisterRoleTabs active="mechanic" />
        </div>

        <header className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <Wrench size={28} />
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            Join RoadSafe as a Mechanic
          </h1>

          <p className="mt-2 text-slate-600">
            Create your professional profile and help drivers get roadside
            assistance.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
        >
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <UserRound size={20} className="text-blue-700" />
              Personal Information
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Full Name *
                </label>
                <input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Enter your full name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone
                    size={17}
                    className="absolute left-3 top-3.5 text-slate-400"
                  />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    required
                    maxLength={15}
                    autoComplete="tel"
                    placeholder="Enter phone number"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Email Address *
                </label>
                <div className="relative">
                  <Mail
                    size={17}
                    className="absolute left-3 top-3.5 text-slate-400"
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Password *
                </label>
                <div className="relative">
                  <LockKeyhole
                    size={17}
                    className="absolute left-3 top-3.5 text-slate-400"
                  />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <BriefcaseBusiness size={20} className="text-blue-700" />
              Professional Details
            </h2>

            <div>
              <label
                htmlFor="experienceYears"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Years of Experience *
              </label>
              <input
                id="experienceYears"
                name="experienceYears"
                type="number"
                min="0"
                max="60"
                step="1"
                value={form.experienceYears}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
              />
            </div>

            <fieldset className="mt-5">
              <legend className="mb-3 text-sm font-medium text-slate-700">
                Services Offered * (select at least one)
              </legend>

              <div className="grid gap-3 sm:grid-cols-2">
                {AVAILABLE_SERVICES.map((service) => (
                  <label
                    key={service}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                      form.services.includes(service)
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.services.includes(service)}
                      onChange={() => handleServiceChange(service)}
                      className="h-4 w-4 accent-blue-700"
                    />
                    {service}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5">
              <label
                htmlFor="serviceArea"
                className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <MapPin size={17} />
                Service Area *
              </label>
              <input
                id="serviceArea"
                name="serviceArea"
                value={form.serviceArea}
                onChange={handleChange}
                required
                maxLength={150}
                placeholder="Enter your city or service area"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-5">
              <label
                htmlFor="bio"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Professional Bio (Optional)
              </label>
              <textarea
                id="bio"
                name="bio"
                value={form.bio}
                onChange={handleChange}
                maxLength={500}
                rows={4}
                placeholder="Describe your repair experience and expertise..."
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-slate-500">
                {form.bio.length}/500 characters
              </p>
            </div>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <LoaderCircle size={19} className="animate-spin" />
                Creating Account...
              </>
            ) : (
              "Register as Mechanic"
            )}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-blue-700 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Your profile will remain pending until an admin completes the
          verification process.
        </p>
      </div>
    </main>
  );
}
