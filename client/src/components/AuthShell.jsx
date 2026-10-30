import { Link } from "react-router-dom";

// Shared card used by the password-recovery pages (matches the login page).
export default function AuthShell({ title, subtitle, children, onSubmit }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-lg"
      >
        <div>
          <p className="font-bold text-blue-700">RoadSafe</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>

        {children}

        <p className="border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
          <Link to="/login" className="font-semibold text-blue-700 hover:underline">
            ← Back to login
          </Link>
        </p>
      </form>
    </main>
  );
}
