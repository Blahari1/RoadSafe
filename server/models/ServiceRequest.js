const mongoose = require("mongoose");

const serviceRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
    },

    mechanicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    serviceType: {
      type: String,
      required: true,
      enum: [
        "General Repair",
        "Engine Repair",
        "Battery Service",
        "Tyre/Puncture Repair",
        "Towing",
        "Electrical Repair",
        "Oil Change",
        "Brake Repair",
      ],
    },

    problemDescription: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },

    location: {
      address: {
        type: String,
        required: true,
        trim: true,
        maxlength: 250,
      },
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "in_progress", "completed", "cancelled"],
      default: "pending",
      index: true,
    },

    // Timestamps recorded when the request reaches each status.
    // Requests created before these fields existed simply have no value.
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

serviceRequestSchema.index({ mechanicId: 1, status: 1 });
serviceRequestSchema.index({ createdAt: -1 });
// Supports the mechanic request query: pending + service type + coordinate box.
serviceRequestSchema.index({
  status: 1,
  serviceType: 1,
  "location.latitude": 1,
  "location.longitude": 1,
});

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
