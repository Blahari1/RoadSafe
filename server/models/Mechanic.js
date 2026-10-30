const mongoose = require("mongoose");

const mechanicSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    experienceYears: {
      type: Number,
      required: true,
      min: 0,
      max: 60,
    },

    services: {
      type: [String],
      required: true,
      validate: {
        validator: (services) => services.length > 0,
        message: "Select at least one service",
      },
    },

    serviceArea: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    location: {
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
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    isAvailable: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Mechanic", mechanicSchema);
