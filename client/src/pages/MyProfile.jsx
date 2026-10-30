import { UserRound } from "lucide-react";
import useAuth from "../context/useAuth";

export default function MyProfile() {
  const { user } = useAuth();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <UserRound size={30} className="text-blue-700" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My Profile</h1>
      <p className="mt-2 text-slate-600">
        Your account details retrieved through authentication.
      </p>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-sm text-slate-500">Full name</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {user?.name || "Not available"}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-sm text-slate-500">Email</dt>
          <dd className="mt-1 break-words font-semibold text-slate-900">
            {user?.email || "Not available"}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-sm text-slate-500">Phone</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {user?.phone || "Not available"}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-sm text-slate-500">Account role</dt>
          <dd className="mt-1 font-semibold capitalize text-slate-900">
            {user?.role || "Customer"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
