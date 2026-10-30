import { useCallback, useEffect, useState } from "react";
import {
  Phone,
  Mail,
  MapPin,
  Wrench,
  BriefcaseBusiness,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  XCircle,
  Pencil,
  Save,
  X,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import api from "../services/api";
import useAuth from "../context/useAuth";
import useMechanicContext from "../hooks/useMechanicContext";
import LocationMap from "../components/LocationMap";
import { StarDisplay, RatingSummary } from "../components/StarRating";
import { formatDay } from "../utils/format";

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

const emptyProfile = {
  experienceYears: 0,
  services: [],
  serviceArea: "",
  bio: "",
};

const statusDetails = {
  pending: {
    label: "Pending Verification",
    description: "An admin still needs to review your profile.",
    icon: Clock3,
    style: "bg-amber-50 text-amber-800 border-amber-200",
  },
  approved: {
    label: "Approved",
    description: "Your profile has been approved by an admin.",
    icon: CheckCircle2,
    style: "bg-green-50 text-green-800 border-green-200",
  },
  rejected: {
    label: "Rejected",
    description:
      "Your profile has not been approved. Contact the admin for guidance.",
    icon: XCircle,
    style: "bg-red-50 text-red-800 border-red-200",
  },
};

export default function MechanicProfile() {
  const { user } = useAuth();
  const { refreshProfile } = useMechanicContext();
  const [reviews, setReviews] = useState([]);

  const [mechanic, setMechanic] = useState(null);
  const [form, setForm] = useState(emptyProfile);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      const response = await api.get("/mechanics/me");
      const profile = response.data.mechanic;

      setError("");
      setMechanic(profile);

      // Reviews are optional extras: a failure must not hide the profile.
      try {
        const reviewResponse = await api.get("/mechanics/me/reviews");
        setReviews(reviewResponse.data.reviews || []);
      } catch {
        setReviews([]);
      }
      setForm({
        experienceYears: profile.experienceYears ?? 0,
        services: profile.services ?? [],
        serviceArea: profile.serviceArea ?? "",
        bio: profile.bio ?? "",
      });

      // Load the mechanic's saved service-location coordinates.
      setLatitude(
        profile.location?.latitude != null
          ? String(profile.location.latitude)
          : "",
      );

      setLongitude(
        profile.location?.longitude != null
          ? String(profile.location.longitude)
          : "",
      );
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load your mechanic profile.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadProfile, 0);

    return () => clearTimeout(timer);
  }, [loadProfile]);

  const handleAvailabilityToggle = async () => {
    setAvailabilitySaving(true);
    setError("");
    setMessage("");

    try {
      const response = await api.patch("/mechanics/me/availability", {
        isAvailable: !mechanic.isAvailable,
      });

      // Keep the already-loaded account details; only update availability.
      setMechanic((previous) => ({
        ...previous,
        isAvailable: response.data.mechanic.isAvailable,
      }));
      setMessage(response.data.message || "Availability updated.");
      refreshProfile();
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to update your availability.",
      );
    } finally {
      setAvailabilitySaving(false);
    }
  };

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

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (form.services.length === 0) {
      setError("Please select at least one service.");
      return;
    }

    if (
      form.experienceYears === "" ||
      !Number.isInteger(Number(form.experienceYears)) ||
      Number(form.experienceYears) < 0 ||
      Number(form.experienceYears) > 60
    ) {
      setError("Experience must be a whole number from 0 to 60.");
      return;
    }

    if (!form.serviceArea.trim()) {
      setError("Please enter your service area.");
      return;
    }

    // Validate latitude and longitude before sending the update.
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      latitude.trim() === "" ||
      longitude.trim() === "" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setError("Enter a valid latitude and longitude.");
      return;
    }

    if (lat === 0 && lng === 0) {
      setError(
        "0, 0 is not a real service location. Use the map or the location button.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await api.put("/mechanics/me", {
        experienceYears: Number(form.experienceYears),
        services: form.services,
        serviceArea: form.serviceArea.trim(),
        bio: form.bio.trim(),
        location: {
          latitude: lat,
          longitude: lng,
        },
      });

      const updatedMechanic = response.data.mechanic;

      setMechanic((previous) => ({
        ...previous,
        ...updatedMechanic,
      }));

      setForm({
        experienceYears: updatedMechanic.experienceYears,
        services: updatedMechanic.services,
        serviceArea: updatedMechanic.serviceArea,
        bio: updatedMechanic.bio ?? "",
      });

      // Keep the displayed coordinate fields synchronized with the response.
      setLatitude(
        updatedMechanic.location?.latitude != null
          ? String(updatedMechanic.location.latitude)
          : String(lat),
      );

      setLongitude(
        updatedMechanic.location?.longitude != null
          ? String(updatedMechanic.location.longitude)
          : String(lng),
      );

      setEditing(false);
      setMessage("Your professional profile has been updated.");
      refreshProfile();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Fills the coordinate fields from the browser (only after the user taps the
  // button and allows location access). Manual entry always remains possible.
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location access. Enter coordinates manually.");
      return;
    }

    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
      },
      () => {
        setError("Could not get your location. Allow location access or enter coordinates manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Position shown on the confirmation map (null until both fields are valid).
  const pickerLat = latitude.trim() === "" ? NaN : Number(latitude);
  const pickerLng = longitude.trim() === "" ? NaN : Number(longitude);
  const pickerPosition =
    Number.isFinite(pickerLat) &&
    Number.isFinite(pickerLng) &&
    Math.abs(pickerLat) <= 90 &&
    Math.abs(pickerLng) <= 180
      ? [pickerLat, pickerLng]
      : null;

  const cancelEditing = () => {
    if (mechanic) {
      setForm({
        experienceYears: mechanic.experienceYears ?? 0,
        services: mechanic.services ?? [],
        serviceArea: mechanic.serviceArea ?? "",
        bio: mechanic.bio ?? "",
      });

      setLatitude(
        mechanic.location?.latitude != null
          ? String(mechanic.location.latitude)
          : "",
      );

      setLongitude(
        mechanic.location?.longitude != null
          ? String(mechanic.location.longitude)
          : "",
      );
    }

    setEditing(false);
    setError("");
    setMessage("");
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center p-8">
        <LoaderCircle className="animate-spin text-blue-700" size={32} />
        <span className="ml-3 text-slate-600">Loading mechanic profile...</span>
      </div>
    );
  }

  if (error && !mechanic) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h1 className="font-semibold text-red-800">Unable to load profile</h1>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={loadProfile}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!mechanic) return null;

  const account = mechanic.userId || user || {};
  const status =
    statusDetails[mechanic.verificationStatus] || statusDetails.pending;
  const StatusIcon = status.icon;

  return (
    <div>
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
              RoadSafe Mechanic Portal
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              My Professional Profile
            </h1>
            <p className="mt-2 text-slate-600">
              Manage your professional information and track verification.
            </p>
          </div>

          {!editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError("");
                setMessage("");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
            >
              <Pencil size={17} />
              Edit Profile
            </button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            {message}
          </div>
        )}

        <section className={`mb-6 rounded-xl border p-5 ${status.style}`}>
          <div className="flex items-start gap-3">
            <StatusIcon size={25} className="mt-0.5 shrink-0" />
            <div>
              <h2 className="font-bold">{status.label}</h2>
              <p className="mt-1 text-sm">{status.description}</p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900">
                Availability: {mechanic.isAvailable ? "Available" : "Unavailable"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {mechanic.verificationStatus !== "approved"
                  ? "You can go available once an admin approves your profile."
                  : mechanic.isAvailable
                    ? "Customers searching for nearby mechanics can see you."
                    : "You are hidden from customers' nearby mechanic search."}
              </p>
              {mechanic.location?.latitude == null && (
                <p className="mt-1 text-sm text-amber-700">
                  No service location saved. Without one you will not receive
                  requests that have a pinned location, and customers cannot
                  find you in nearby searches. Choose Edit profile to add it.
                </p>
              )}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(mechanic.isAvailable)}
              aria-label="Toggle availability"
              onClick={handleAvailabilityToggle}
              disabled={
                availabilitySaving ||
                (mechanic.verificationStatus !== "approved" &&
                  !mechanic.isAvailable)
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                mechanic.isAvailable ? "bg-green-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  mechanic.isAvailable ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-800">
              <Wrench size={30} />
            </div>

            <div className="min-w-0">
              <h2 className="break-words text-2xl font-bold text-slate-900">
                {account.name || "Mechanic"}
              </h2>
              <p className="mt-1 text-slate-500">
                RoadSafe Service Professional
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {mechanic.experienceYears}{" "}
                {mechanic.experienceYears === 1 ? "year" : "years"} of
                experience
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-5 text-lg font-bold text-slate-900">
              Account Information
            </h2>

            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <Mail size={19} className="mt-0.5 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="break-all font-medium text-slate-800">
                    {account.email || "Not available"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone size={19} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Phone</p>
                  <p className="font-medium text-slate-800">
                    {account.phone || "Not available"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ShieldCheck size={19} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Verification</p>
                  <p className="font-medium capitalize text-slate-800">
                    {mechanic.verificationStatus || "pending"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
            <h2 className="mb-5 text-lg font-bold text-slate-900">
              Professional Details
            </h2>

            {editing ? (
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label
                    htmlFor="experienceYears"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Years of Experience
                  </label>
                  <input
                    id="experienceYears"
                    name="experienceYears"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    required
                    value={form.experienceYears}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <fieldset>
                  <legend className="mb-3 text-sm font-medium text-slate-700">
                    Services Offered
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {AVAILABLE_SERVICES.map((service) => (
                      <label
                        key={service}
                        className="flex items-center gap-2 text-sm text-slate-700"
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

                <div>
                  <label
                    htmlFor="serviceArea"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Service Area
                  </label>
                  <input
                    id="serviceArea"
                    name="serviceArea"
                    value={form.serviceArea}
                    onChange={handleChange}
                    maxLength={150}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Mechanic service-location coordinates */}
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <MapPin size={16} />
                  Use my current location
                </button>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="latitude"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Latitude
                    </label>
                    <input
                      id="latitude"
                      name="latitude"
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      required
                      value={latitude}
                      onChange={(event) => setLatitude(event.target.value)}
                      placeholder="e.g. 12.9716"
                      className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="longitude"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Longitude
                    </label>
                    <input
                      id="longitude"
                      name="longitude"
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      required
                      value={longitude}
                      onChange={(event) => setLongitude(event.target.value)}
                      placeholder="e.g. 77.5946"
                      className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <p className="text-sm text-slate-500">
                  Use the button, tap the map, or type the coordinates. This
                  should be your service area or operating base. It decides
                  which requests with a pinned location you can see and accept
                  (within the platform radius). Check that the pin is in the
                  right place; latitude comes first, then longitude.
                </p>

                <LocationMap
                  position={pickerPosition}
                  label="Your service location"
                  onLocationSelect={([lat, lng]) => {
                    setLatitude(lat.toFixed(6));
                    setLongitude(lng.toFixed(6));
                  }}
                />

                {!pickerPosition && (
                  <p className="text-sm font-medium text-amber-700">
                    No location chosen yet. The pin above only shows the
                    default map centre until you tap the map or use the
                    location button.
                  </p>
                )}

                <div>
                  <label
                    htmlFor="bio"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Professional Bio
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    value={form.bio}
                    onChange={handleChange}
                    rows={4}
                    maxLength={500}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="mt-1 text-right text-xs text-slate-500">
                    {form.bio.length}/500 characters
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {saving ? (
                      <LoaderCircle size={17} className="animate-spin" />
                    ) : (
                      <Save size={17} />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X size={17} />
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <BriefcaseBusiness
                    size={19}
                    className="mt-0.5 text-slate-400"
                  />
                  <div>
                    <p className="text-sm text-slate-500">Experience</p>
                    <p className="font-medium text-slate-800">
                      {mechanic.experienceYears} years
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin size={19} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500">Service Area</p>
                    <p className="font-medium text-slate-800">
                      {mechanic.serviceArea}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Service Location Coordinates
                    </p>

                    {mechanic.location?.latitude != null &&
                    mechanic.location?.longitude != null ? (
                      <div className="mt-1 text-sm text-slate-700">
                        <p>
                          <strong>Latitude:</strong>{" "}
                          {mechanic.location.latitude}
                        </p>
                        <p>
                          <strong>Longitude:</strong>{" "}
                          {mechanic.location.longitude}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">
                        No coordinates saved yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-slate-500">
                    Services Offered
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mechanic.services?.map((service) => (
                      <span
                        key={service}
                        className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-slate-500">
                    Professional Bio
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {mechanic.bio || "No professional bio added yet."}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-slate-900">Customer reviews</h2>
            <RatingSummary
              average={mechanic.ratingAverage}
              count={mechanic.ratingCount || 0}
            />
          </div>

          {reviews.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Reviews from customers appear here after completed jobs. None
              yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {reviews.map((review) => (
                <li key={review._id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarDisplay value={review.rating} />
                    <span className="text-sm font-semibold text-slate-800">
                      {review.customerName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {review.serviceType ? `${review.serviceType} · ` : ""}
                      {formatDay(review.createdAt)}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                      {review.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-center text-sm text-slate-500">
          Keep your professional information accurate and up to date.
        </p>
      </div>
    </div>
  );
}
