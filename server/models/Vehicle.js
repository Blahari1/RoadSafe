const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },

    vehicleType: {
      type: String,
      required: true,
      enum: ["Car", "Bike", "Scooter", "Van", "Truck", "Other"],
    },

    brand: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    model: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    fuelType: {
      type: String,
      required: true,
      enum: ["Petrol", "Diesel", "Electric", "Hybrid", "CNG", "Other"],
    },

    year: {
      type: Number,
      required: true,
      min: 1900,
      max: new Date().getFullYear() + 1,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
