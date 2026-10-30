import { Link } from "react-router-dom";
import { UserRound, Wrench } from "lucide-react";

// Lets people choose how to register. Both options are always visible.
export default function RegisterRoleTabs({ active }) {
  const base =
    "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition";
  const on = "bg-blue-700 text-white shadow-sm";
  const off = "text-slate-600 hover:bg-white hover:text-slate-900";

  return (
    <nav
      aria-label="Choose account type"
      className="flex gap-1 rounded-xl bg-slate-100 p-1"
    >
      <Link
        to="/register"
        aria-current={active === "customer" ? "page" : undefined}
        className={`${base} ${active === "customer" ? on : off}`}
      >
        <UserRound size={17} />
        Register as Customer
      </Link>

      <Link
        to="/mechanic/register"
        aria-current={active === "mechanic" ? "page" : undefined}
        className={`${base} ${active === "mechanic" ? on : off}`}
      >
        <Wrench size={17} />
        Register as Mechanic
      </Link>
    </nav>
  );
}
