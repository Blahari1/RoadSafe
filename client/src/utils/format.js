export const formatStatus = (status = "") =>
  status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

export const formatDate = (date, fallback = "Not available") => {
  if (!date) return fallback;

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return fallback;

  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const formatDay = (date, fallback = "Not available") => {
  if (!date) return fallback;

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return fallback;

  return parsed.toLocaleDateString("en-IN", { dateStyle: "medium" });
};

export const formatCurrency = (amount, currency = "INR") => {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount);
};

export const formatVehicle = (vehicle) =>
  vehicle && typeof vehicle === "object"
    ? `${vehicle.vehicleNumber} — ${vehicle.brand} ${vehicle.model}`
    : "Vehicle information unavailable";

export const hasCoordinates = (location) =>
  Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);

export const mapLink = (location) =>
  hasCoordinates(location)
    ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`
    : null;

export const statusStyles = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-700",
};

export const apiError = (err, fallback) =>
  err?.response?.data?.message || fallback;
