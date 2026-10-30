import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CarFront,
  CheckCircle2,
  Fuel,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import api from "../services/api";

const initialForm = {
  vehicleNumber: "",
  vehicleType: "Car",
  brand: "",
  model: "",
  fuelType: "Petrol",
  year: String(new Date().getFullYear()),
};

const vehicleTypes = ["Car", "Bike", "Scooter", "Van", "Truck", "Other"];

const fuelTypes = ["Petrol", "Diesel", "Electric", "Hybrid", "CNG", "Other"];

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export default function MyVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState(initialForm);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadVehicles = useCallback(async () => {
    try {
      const response = await api.get("/vehicles");
      setError("");
      setVehicles(response.data.vehicles || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load vehicles. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so state updates happen in a callback, not synchronously in the effect.
    const timer = setTimeout(loadVehicles, 0);

    return () => clearTimeout(timer);
  }, [loadVehicles]);

  const openAddForm = () => {
    setEditingVehicle(null);
    setForm(initialForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEditForm = (vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      vehicleNumber: vehicle.vehicleNumber || "",
      vehicleType: vehicle.vehicleType || "Car",
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      fuelType: vehicle.fuelType || "Petrol",
      year: String(vehicle.year || ""),
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingVehicle(null);
    setForm(initialForm);
    setError("");
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const currentYear = new Date().getFullYear();
    const year = Number(form.year);

    if (
      !form.vehicleNumber.trim() ||
      !form.brand.trim() ||
      !form.model.trim() ||
      !form.year ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > currentYear + 1
    ) {
      setError("Please enter valid vehicle details and year.");
      return;
    }

    const payload = {
      ...form,
      vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year,
    };

    setSaving(true);

    try {
      if (editingVehicle) {
        await api.put(`/vehicles/${editingVehicle._id}`, payload);
        setSuccess("Vehicle updated successfully.");
      } else {
        await api.post("/vehicles", payload);
        setSuccess("Vehicle added successfully.");
      }

      setShowForm(false);
      setEditingVehicle(null);
      setForm(initialForm);
      await loadVehicles();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to save the vehicle. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle) => {
    const confirmed = window.confirm(
      `Delete ${vehicle.brand} ${vehicle.model} (${vehicle.vehicleNumber})?`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(vehicle._id);

    try {
      await api.delete(`/vehicles/${vehicle._id}`);
      setSuccess("Vehicle deleted successfully.");
      await loadVehicles();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete the vehicle.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            VEHICLE MANAGEMENT
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            My Vehicles
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage the vehicles you may need roadside assistance for.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <Plus size={18} />
          Add Vehicle
        </button>
      </section>

      {error && !showForm && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 size={19} />
          {success}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Registered vehicles</h2>
            <p className="mt-1 text-sm text-slate-500">
              {vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"}{" "}
              in your account
            </p>
          </div>

          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <CarFront size={23} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <LoaderCircle size={20} className="animate-spin" />
            Loading vehicles...
          </div>
        ) : vehicles.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <CarFront size={32} />
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">
              No vehicles added yet
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Add your first vehicle so its details are ready when you need
              roadside assistance.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Plus size={18} />
              Add your first vehicle
            </button>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((vehicle) => (
              <article
                key={vehicle._id}
                className="rounded-2xl border border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <CarFront size={25} />
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {vehicle.vehicleType}
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  {vehicle.brand} {vehicle.model}
                </h3>

                <p className="mt-2 inline-block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold tracking-wide text-slate-700">
                  {vehicle.vehicleNumber}
                </p>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <Fuel size={16} />
                    {vehicle.fuelType}
                  </p>
                  <p>Year: {vehicle.year}</p>
                </div>

                <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => openEditForm(vehicle)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                  >
                    <Pencil size={16} />
                    Edit
                  </button>

                  <button
                    type="button"
                    disabled={deletingId === vehicle._id}
                    onClick={() => handleDelete(vehicle)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    {deletingId === vehicle._id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-form-title"
            className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="vehicle-form-title"
                  className="text-xl font-bold text-slate-900"
                >
                  {editingVehicle ? "Edit vehicle" : "Add a vehicle"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the vehicle details below.
                </p>
              </div>

              <button
                type="button"
                disabled={saving}
                aria-label="Close form"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="vehicleNumber"
                  className="text-sm font-medium text-slate-700"
                >
                  Registration number
                </label>
                <input
                  id="vehicleNumber"
                  name="vehicleNumber"
                  value={form.vehicleNumber}
                  onChange={handleChange}
                  placeholder="e.g. KA36AB1234"
                  maxLength={20}
                  className={inputClass}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="vehicleType"
                    className="text-sm font-medium text-slate-700"
                  >
                    Vehicle type
                  </label>
                  <select
                    id="vehicleType"
                    name="vehicleType"
                    value={form.vehicleType}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  >
                    {vehicleTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="fuelType"
                    className="text-sm font-medium text-slate-700"
                  >
                    Fuel type
                  </label>
                  <select
                    id="fuelType"
                    name="fuelType"
                    value={form.fuelType}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  >
                    {fuelTypes.map((fuel) => (
                      <option key={fuel} value={fuel}>
                        {fuel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="brand"
                    className="text-sm font-medium text-slate-700"
                  >
                    Brand
                  </label>
                  <input
                    id="brand"
                    name="brand"
                    value={form.brand}
                    onChange={handleChange}
                    placeholder="e.g. Hyundai"
                    maxLength={50}
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="model"
                    className="text-sm font-medium text-slate-700"
                  >
                    Model
                  </label>
                  <input
                    id="model"
                    name="model"
                    value={form.model}
                    onChange={handleChange}
                    placeholder="e.g. i20"
                    maxLength={50}
                    className={inputClass}
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="year"
                    className="text-sm font-medium text-slate-700"
                  >
                    Manufacturing/model year
                  </label>
                  <input
                    id="year"
                    name="year"
                    type="number"
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    value={form.year}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeForm}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving && (
                    <LoaderCircle size={17} className="animate-spin" />
                  )}
                  {saving
                    ? "Saving..."
                    : editingVehicle
                      ? "Save Changes"
                      : "Add Vehicle"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
