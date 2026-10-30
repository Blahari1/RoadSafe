import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";
import useMechanicContext from "../hooks/useMechanicContext";

const CONTENT = {
  pending: {
    icon: Clock3,
    iconClass: "text-amber-600",
    box: "border-amber-200 bg-amber-50",
    title: "Waiting for admin approval",
    text: "Your mechanic account has been created. An administrator must verify your profile before you can view or accept roadside assistance requests. You can still complete your profile while you wait.",
  },
  rejected: {
    icon: XCircle,
    iconClass: "text-red-600",
    box: "border-red-200 bg-red-50",
    title: "Your profile was not approved",
    text: "An administrator reviewed your profile and did not approve it, so you cannot accept requests. You can update your profile details. Please contact RoadSafe support for guidance on next steps.",
  },
};

// Shown to pending and rejected mechanics instead of the requests page.
export default function MechanicVerification() {
  const { profile, refreshProfile } = useMechanicContext();
  const [checking, setChecking] = useState(false);

  // Approved mechanics never need this page.
  if (profile.verificationStatus === "approved") {
    return <Navigate to="/mechanic/requests" replace />;
  }

  const content = CONTENT[profile.verificationStatus] || CONTENT.pending;
  const Icon = content.icon;

  const handleCheck = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className={`rounded-2xl border p-6 sm:p-8 ${content.box}`}>
        <Icon size={40} className={content.iconClass} />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{content.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">{content.text}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            <RefreshCw size={16} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking..." : "Check status again"}
          </button>

          <Link
            to="/mechanic/profile"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            View / edit my profile
          </Link>
        </div>
      </section>

      {profile.location?.latitude == null && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Add your service location now</p>
          <p className="mt-1">
            Once approved, you only receive requests with a pinned location if
            your profile has a saved service location. You can add it while you
            wait.{" "}
            <Link to="/mechanic/profile" className="font-semibold underline">
              Open my profile
            </Link>
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">What approved mechanics can do</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {[
            "See pending requests that match their services",
            "Accept a request while marked as available",
            "Update job progress and issue invoices for completed jobs",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-slate-400" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
