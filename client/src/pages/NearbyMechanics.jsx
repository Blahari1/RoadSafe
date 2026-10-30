import { useState } from "react";
import api from "../services/api";
import LocationMap from "../components/LocationMap";
import { RatingSummary } from "../components/StarRating";

const SERVICES = [
  "General Repair",
  "Engine Repair",
  "Battery Service",
  "Tyre/Puncture Repair",
  "Towing",
  "Electrical Repair",
  "Oil Change",
  "Brake Repair",
];

export default function NearbyMechanics() {
  const [location, setLocation] = useState(null);
  const [serviceType, setServiceType] = useState("Battery Service");
  const [radiusKm, setRadiusKm] = useState("20");
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [radiusNote, setRadiusNote] = useState("");

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location access.");
      return;
    }

    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setError("Location access failed. Please select a point on the map.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    if (!location) {
      setError("Select your location on the map first.");
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const response = await api.get("/mechanics/nearby", {
        params: {
          lat: location.latitude,
          lng: location.longitude,
          serviceType,
          radiusKm: Number(radiusKm),
        },
      });

      setMechanics(response.data.mechanics || []);
      setRadiusNote(
        response.data.radiusCapped
          ? `Results are limited to ${response.data.maxRadiusKm} km, the maximum distance mechanics are matched within.`
          : "",
      );
    } catch (err) {
      setMechanics([]);
      setError(
        err.response?.data?.message || "Unable to load nearby mechanics.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nearby Mechanics</h1>
        <p className="mt-1 text-sm text-gray-600">
          Find approved mechanics near your breakdown location.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold">Choose your location</h2>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Use My Current Location
        </button>

        <LocationMap
          position={
            location ? [location.latitude, location.longitude] : undefined
          }
          onLocationSelect={(coordinates) => {
            setLocation({
              latitude: coordinates[0],
              longitude: coordinates[1],
            });
            setError("");
          }}
        />

        {location && (
          <p className="text-sm text-gray-600">
            Selected coordinates: {location.latitude.toFixed(6)},{" "}
            {location.longitude.toFixed(6)}
          </p>
        )}

        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Required service
            </label>
            <select
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3"
            >
              {SERVICES.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Search radius
            </label>
            <select
              value={radiusKm}
              onChange={(event) => setRadiusKm(event.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3"
            >
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="20">20 km</option>
              <option value="50">50 km</option>
              <option value="100">100 km</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-gray-900 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {loading ? "Searching..." : "Find Nearby Mechanics"}
          </button>
        </form>
      </section>

      {error && (
        <p
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {searched && !loading && !error && (
        <p className="text-sm text-gray-600">
          Found {mechanics.length} matching mechanic
          {mechanics.length === 1 ? "" : "s"}. Distances are approximate
          straight-line values, not driving distances or arrival times.
          {radiusNote && ` ${radiusNote}`}
        </p>
      )}

      <section className="space-y-3">
        {mechanics.map((mechanic) => (
          <article
            key={mechanic._id}
            className="space-y-2 rounded-xl border border-gray-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {mechanic.userId?.name || "Mechanic"}
              </h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
                ≈ {mechanic.distanceKm} km away
              </span>
            </div>

            <p className="text-sm text-gray-600">
              Service area: {mechanic.serviceArea || "Not specified"}
            </p>

            <p className="text-sm">
              Services: {(mechanic.services || []).join(", ")}
            </p>

            <p className="text-sm">Availability: Available now</p>

            <p className="text-sm">
              Experience: {mechanic.experienceYears} year
              {mechanic.experienceYears === 1 ? "" : "s"}
            </p>

            <RatingSummary
              average={mechanic.ratingAverage}
              count={mechanic.ratingCount}
            />

            {mechanic.userId?.phone && (
              <p className="text-sm">Phone: {mechanic.userId.phone}</p>
            )}
          </article>
        ))}

        {searched && !loading && !error && mechanics.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
            <h2 className="font-semibold">No matching mechanics found</h2>
            <p className="mt-2 text-sm text-gray-600">
              Try a larger search radius or another service. Mechanics must be
              approved and have saved valid coordinates.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
