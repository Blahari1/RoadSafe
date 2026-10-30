import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import LocationMap from "../components/LocationMap";
import { SERVICE_TYPES } from "../constants";

export default function RequestAssistance() {
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    vehicleId: "",
    serviceType: "",
    problemDescription: "",
    address: "",
  });

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [existingRequestId, setExistingRequestId] = useState("");
  const [locating, setLocating] = useState(false);

  const handleLocationSelect = (coordinates) => {
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(Number(coordinates[0])) ||
      !Number.isFinite(Number(coordinates[1]))
    ) {
      setLocationError("Please select a valid location on the map.");
      return;
    }

    const latitude = Number(coordinates[0]);
    const longitude = Number(coordinates[1]);

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setLocationError("Please select valid map coordinates.");
      return;
    }

    setSelectedLocation({
      latitude,
      longitude,
    });

    setLocationError("");
    setError("");
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location access.");
      return;
    }

    setLocationError("");
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setSelectedLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        setLocationError("");
        setError("");
      },
      (err) => {
        setLocating(false);
        let message =
          "Unable to get your location. Allow location access or select a point on the map.";

        if (err.code === 1) {
          message =
            "Location permission was denied. Allow location access or select a point on the map.";
        } else if (err.code === 3) {
          message =
            "Location request timed out. Please try again or select a point on the map.";
        }

        setLocationError(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  useEffect(() => {
    let isMounted = true;

    const loadVehicles = async () => {
      try {
        if (isMounted) {
          setLoadingVehicles(true);
          setError("");
        }

        const response = await api.get("/vehicles");
        const vehicleList = response.data.vehicles || [];

        if (!isMounted) return;

        setVehicles(vehicleList);

        if (vehicleList.length > 0) {
          setFormData((previous) => ({
            ...previous,
            vehicleId: previous.vehicleId || vehicleList[0]._id,
          }));
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.response?.data?.message ||
              "Unable to load your vehicles. Please try again.",
          );
        }
      } finally {
        if (isMounted) {
          setLoadingVehicles(false);
        }
      }
    };

    loadVehicles();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Prevent duplicate submissions from double taps or repeated clicks.
    if (submitting) return;

    setError("");

    if (!formData.vehicleId) {
      setError("Please select a vehicle.");
      return;
    }

    if (!formData.serviceType) {
      setError("Please select a service type.");
      return;
    }

    if (formData.problemDescription.trim().length < 10) {
      setError("Describe the problem using at least 10 characters.");
      return;
    }

    // The map pin can stand in for a typed address, so the address is only
    // mandatory when no location has been marked on the map.
    const typedAddress = formData.address.trim();

    if (!typedAddress && !selectedLocation) {
      setError(
        "Share your location with the button below, tap the map, or type where your vehicle is.",
      );
      return;
    }

    const address =
      typedAddress ||
      `Pinned on map: ${selectedLocation.latitude.toFixed(5)}, ${selectedLocation.longitude.toFixed(5)}`;

    if (address.length > 250) {
      setError("The address must not exceed 250 characters.");
      return;
    }

    if (
      selectedLocation &&
      (!Number.isFinite(selectedLocation.latitude) ||
        !Number.isFinite(selectedLocation.longitude) ||
        selectedLocation.latitude < -90 ||
        selectedLocation.latitude > 90 ||
        selectedLocation.longitude < -180 ||
        selectedLocation.longitude > 180)
    ) {
      setLocationError("Please select valid map coordinates.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await api.post("/service-requests", {
        vehicleId: formData.vehicleId,
        serviceType: formData.serviceType,
        problemDescription: formData.problemDescription.trim(),
        location: {
          address,
          ...(selectedLocation && {
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
          }),
        },
      });

      const requestId = response.data.serviceRequest?._id;

      // Go straight to the live status page for the new request.
      navigate(requestId ? `/service-history/${requestId}` : "/service-history", {
        replace: true,
        state: { justCreated: true },
      });
    } catch (err) {
      const existingId = err.response?.data?.existingRequestId;

      setError(
        err.response?.data?.message ||
          "Unable to submit your request. Check your connection and try again.",
      );

      // An open request already exists: let the customer jump to it.
      setExistingRequestId(existingId || "");
      setSubmitting(false);
    }
  };

  if (loadingVehicles) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-gray-600">Loading your registered vehicles...</p>
      </div>
    );
  }

  if (vehicles.length === 0 && !error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            Request Roadside Assistance
          </h1>

          <p className="mt-3 text-gray-600">
            You need to register a vehicle before requesting assistance.
          </p>

          <Link
            to="/vehicles"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Add a Vehicle
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
          Emergency assistance
        </p>

        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Request Emergency Assistance
        </h1>

        <p className="mt-2 text-gray-600">
          Four quick steps: vehicle, service, what happened, and where you are.
          Approved, available mechanics who offer the service will see your
          request. Response times cannot be guaranteed.
        </p>
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          In immediate danger or after an accident with injuries, call your
          local emergency number first.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8"
      >
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
            {existingRequestId && (
              <Link
                to={`/service-history/${existingRequestId}`}
                className="mt-2 block font-semibold underline"
              >
                View your open request
              </Link>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="vehicleId"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            Select Vehicle *
          </label>

          <select
            id="vehicleId"
            name="vehicleId"
            value={formData.vehicleId}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Choose your vehicle</option>

            {vehicles.map((vehicle) => (
              <option key={vehicle._id} value={vehicle._id}>
                {vehicle.vehicleNumber} — {vehicle.brand} {vehicle.model}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="serviceType"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            Service Required *
          </label>

          <select
            id="serviceType"
            name="serviceType"
            value={formData.serviceType}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Choose a service</option>

            {SERVICE_TYPES.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="problemDescription"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            Describe the Problem *
          </label>

          <textarea
            id="problemDescription"
            name="problemDescription"
            value={formData.problemDescription}
            onChange={handleChange}
            minLength={10}
            maxLength={1000}
            rows={4}
            required
            placeholder="Example: My bike stopped suddenly and the engine will not start."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          <p className="mt-1 text-right text-xs text-gray-500">
            {formData.problemDescription.length}/1000 characters
          </p>
        </div>

        <div>
          <label
            htmlFor="address"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            Landmark / address (optional if you share your location)
          </label>

          <textarea
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            maxLength={250}
            rows={2}
            placeholder="Road, area, landmark and city — helps the mechanic find you."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          <p className="mt-1 text-sm text-gray-500">
            If location sharing is blocked or inaccurate, type where you are and
            tap the map to place the pin manually.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Breakdown Location
          </h2>

          <p className="text-sm text-gray-600">
            Share your location with the button, or tap the map to place the
            pin. Check that the pin is where your vehicle is.
          </p>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {locating ? "Finding your location..." : "Use My Current Location"}
          </button>

          <LocationMap
            position={
              selectedLocation
                ? [selectedLocation.latitude, selectedLocation.longitude]
                : undefined
            }
            onLocationSelect={handleLocationSelect}
          />

          {selectedLocation && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="mb-1 font-semibold">Location pinned — please confirm it is correct</p>
              <p>
                <strong>Latitude:</strong>{" "}
                {selectedLocation.latitude.toFixed(6)}
              </p>

              <p>
                <strong>Longitude:</strong>{" "}
                {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
          )}

          {locationError && (
            <p className="text-sm text-red-600" role="alert">
              {locationError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row">
          <button
            type="submit"
            disabled={submitting || vehicles.length === 0}
            className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending request..." : "Send Emergency Request"}
          </button>

          <Link
            to="/dashboard"
            className="rounded-lg border border-gray-300 px-6 py-3 text-center font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
