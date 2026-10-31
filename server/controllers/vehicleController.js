const mongoose = require("mongoose");
const Vehicle = require("../models/Vehicle");

const validVehicleId = (id) => mongoose.isValidObjectId(id);

// GET /api/vehicles
const getVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      userId: req.user.userId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve vehicles",
    });
  }
};

// POST /api/vehicles
const addVehicle = async (req, res) => {
  try {
    const { vehicleNumber, vehicleType, brand, model, fuelType, year } =
      req.body;

    if (
      !vehicleNumber?.trim() ||
      !vehicleType ||
      !brand?.trim() ||
      !model?.trim() ||
      !fuelType ||
      year === undefined ||
      year === null ||
      year === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required vehicle details",
      });
    }

    const vehicle = await Vehicle.create({
      userId: req.user.userId,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      vehicleType,
      brand: brand.trim(),
      model: model.trim(),
      fuelType,
      year: Number(year),
    });

    return res.status(201).json({
      success: true,
      message: "Vehicle added successfully",
      vehicle,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to add vehicle",
    });
  }
};

// PUT /api/vehicles/:id
const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validVehicleId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vehicle ID",
      });
    }

    const allowedFields = [
      "vehicleNumber",
      "vehicleType",
      "brand",
      "model",
      "fuelType",
      "year",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (typeof updates.vehicleNumber === "string") {
      updates.vehicleNumber = updates.vehicleNumber.trim().toUpperCase();
    }

    if (typeof updates.brand === "string") {
      updates.brand = updates.brand.trim();
    }

    if (typeof updates.model === "string") {
      updates.model = updates.model.trim();
    }

    if (updates.year !== undefined) {
      updates.year = Number(updates.year);
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    );

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vehicle updated successfully",
      vehicle,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update vehicle",
    });
  }
};

// DELETE /api/vehicles/:id
const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validVehicleId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vehicle ID",
      });
    }

    const vehicle = await Vehicle.findOneAndDelete({
      _id: id,
      userId: req.user.userId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vehicle deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete vehicle",
    });
  }
};

module.exports = {
  getVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
};
