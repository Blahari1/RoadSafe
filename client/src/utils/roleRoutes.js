// Central place for role-based landing pages and permitted paths.
export const ROLE_HOME = {
  customer: "/dashboard",
  mechanic: "/mechanic/requests",
  admin: "/admin",
};

const CUSTOMER_PATHS = [
  "/dashboard",
  "/vehicles",
  "/request-assistance",
  "/nearby-mechanics",
  "/service-history",
  "/invoices",
  "/profile",
];

const startsWithPath = (pathname, base) =>
  pathname === base || pathname.startsWith(`${base}/`);

// Where a logged-in user lands. Mechanics who are not approved yet go to the
// verification-status page instead of a page that would only show an error.
export const getHomePath = (user) => {
  if (!user) return "/login";

  if (user.role === "mechanic") {
    return user.verificationStatus === "approved"
      ? ROLE_HOME.mechanic
      : "/mechanic/verification";
  }

  return ROLE_HOME[user.role] || "/login";
};

// Used to decide whether a saved "return to" URL may be honoured after login.
// A saved URL can never take a user outside their own role's area.
export const isPathAllowedForRole = (role, pathname) => {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) {
    return false;
  }

  if (role === "admin") {
    return startsWithPath(pathname, "/admin");
  }

  if (role === "mechanic") {
    return startsWithPath(pathname, "/mechanic");
  }

  if (role === "customer") {
    return CUSTOMER_PATHS.some((base) => startsWithPath(pathname, base));
  }

  return false;
};
