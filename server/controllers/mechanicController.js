const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Mechanic = require("../models/Mechanic");
const Review = require("../models/Review");
const { SERVICE_TYPES } = require("../utils/constants");
const { buildUserPayload } = require("../utils/userPayload");
const { getRatingSummaries, summaryFor } = require("../utils/ratingSummary");

const ALLOWED_SERVICES = SERVICE_TYPES;

const createToken = (userId) =>
  jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });

// POST /api/mechanics/register
const registerMechanic = async (req, res) => {
  let createdUser;

  try {
    const {
      name,
      email,
      phone,
      password,
      experienceYears,
      services,
      serviceArea,
      bio,
    } = req.body;

    if (
      !name?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !password ||
      experienceYears === undefined ||
      !Array.isArray(services) ||
      !serviceArea?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters",
      });
    }

    const years = Number(experienceYears);

    if (!Number.isInteger(years) || years < 0 || years > 60) {
      return res.status(400).json({
        success: false,
        message: "Experience must be a whole number from 0 to 60",
      });
    }

    const validServices = [...new Set(services)];

    if (
      validServices.length === 0 ||
      validServices.some((service) => !ALLOWED_SERVICES.includes(service))
    ) {
      return res.status(400).json({
        success: false,
        message: "Select valid services",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    createdUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      password: hashedPassword,
      role: "mechanic",
    });

    const mechanic = await Mechanic.create({
      userId: createdUser._id,
      experienceYears: years,
      services: validServices,
      serviceArea: serviceArea.trim(),
      bio: bio?.trim() || "",
      verificationStatus: "pending",
      isAvailable: false,
    });

    return res.status(201).json({
      success: true,
      message: "Mechanic registered. Verification is pending.",
      token: createToken(createdUser._id),
      user: await buildUserPayload(createdUser),
      mechanic,
    });
  } catch (error) {
    // Avoid leaving an account without its mechanic profile.
    if (createdUser) {
      try {
        await User.deleteOne({ _id: createdUser._id });
      } catch (cleanupError) {
        console.error("User cleanup failed:", cleanupError.message);
      }
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Mechanic registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to register mechanic",
    });
  }
};

// GET /api/mechanics/me
const getMyMechanicProfile = async (req, res) => {
  try {
    const mechanic = await Mechanic.findOne({
      userId: req.user.userId,
    }).populate("userId", "name email phone role");

    if (!mechanic) {
      return res.status(404).json({
        success: false,
        message: "Mechanic profile not found",
      });
    }

    const summaries = await getRatingSummaries([req.user.userId]);
    const rating = summaryFor(summaries, req.user.userId);

    return res.status(200).json({
      success: true,
      mechanic: {
        ...mechanic.toObject(),
        ratingAverage: rating.average,
        ratingCount: rating.count,
      },
    });
  } catch (error) {
    console.error("Get mechanic profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve mechanic profile",
    });
  }
};

// PUT /api/mechanics/me
const updateMyMechanicProfile = async (req, res) => {
  try {
    const { experienceYears, services, serviceArea, bio } = req.body;

    const updates = {};

    if (experienceYears !== undefined) {
      const years = Number(experienceYears);

      if (!Number.isInteger(years) || years < 0 || years > 60) {
        return res.status(400).json({
          success: false,
          message: "Experience must be a whole number from 0 to 60",
        });
      }

      updates.experienceYears = years;
    }

    if (services !== undefined) {
      if (
        !Array.isArray(services) ||
        services.length === 0 ||
        services.some((service) => !ALLOWED_SERVICES.includes(service))
      ) {
        return res.status(400).json({
          success: false,
          message: "Select at least one valid service",
        });
      }

      updates.services = [...new Set(services)];
    }

    if (serviceArea !== undefined) {
      if (typeof serviceArea !== "string" || !serviceArea.trim()) {
        return res.status(400).json({
          success: false,
          message: "Service area cannot be empty",
        });
      }

      updates.serviceArea = serviceArea.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== "string") {
        return res.status(400).json({
          success: false,
          message: "Bio must be text",
        });
      }

      updates.bio = bio.trim();
    }

    // Validate and add the mechanic's service-location coordinates.
    if (req.body.location !== undefined) {
      const { latitude, longitude } = req.body.location || {};

      if (
        typeof latitude !== "number" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== "number" ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid latitude and longitude are required.",
        });
      }

      // 0,0 ("Null Island", in the ocean) is almost always an empty/default
      // value rather than a real service location.
      if (latitude === 0 && longitude === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Latitude and longitude of 0, 0 is not a real service location.",
        });
      }

      updates.location = { latitude, longitude };
    }

    // Save all permitted changes, including location, in one operation.
    const mechanic = await Mechanic.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!mechanic) {
      return res.status(404).json({
        success: false,
        message: "Mechanic profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Mechanic profile updated",
      mechanic,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update mechanic profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update mechanic profile",
    });
  }
};

// PATCH /api/mechanics/me/availability
// A mechanic can only change their own availability, and only an approved
// mechanic can become available. Anyone can switch themselves to unavailable.
const updateMyAvailability = async (req, res) => {
  try {
    const { isAvailable } = req.body || {};

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isAvailable must be true or false",
      });
    }

    // The approval check is part of the query itself, so the check and the
    // update happen atomically.
    const filter = { userId: req.user.userId };

    if (isAvailable) {
      filter.verificationStatus = "approved";
    }

    const mechanic = await Mechanic.findOneAndUpdate(
      filter,
      { $set: { isAvailable } },
      { new: true, runValidators: true },
    );

    if (!mechanic) {
      const profileExists = await Mechanic.exists({
        userId: req.user.userId,
      });

      if (!profileExists) {
        return res.status(404).json({
          success: false,
          message: "Mechanic profile not found",
        });
      }

      return res.status(403).json({
        success: false,
        message: "Only approved mechanics can set themselves as available",
      });
    }

    return res.status(200).json({
      success: true,
      message: isAvailable
        ? "You are now available for requests"
        : "You are now unavailable",
      mechanic,
    });
  } catch (error) {
    console.error("Update availability error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update availability",
    });
  }
};

// GET /api/mechanics/me/reviews
// Reviews customers left for this mechanic's completed jobs.
const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ mechanicUserId: req.user.userId })
      .populate("customerId", "name")
      .populate("requestId", "serviceType completedAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const summaries = await getRatingSummaries([req.user.userId]);
    const rating = summaryFor(summaries, req.user.userId);

    return res.status(200).json({
      success: true,
      ratingAverage: rating.average,
      ratingCount: rating.count,
      reviews: reviews.map((review) => ({
        _id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        // First name only, to limit personal data shown to the mechanic.
        customerName:
          review.customerId?.name?.trim().split(/\s+/)[0] || "Customer",
        serviceType: review.requestId?.serviceType || null,
      })),
    });
  } catch (error) {
    console.error("Get mechanic reviews error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve reviews",
    });
  }
};

module.exports = {
  registerMechanic,
  getMyReviews,
  getMyMechanicProfile,
  updateMyMechanicProfile,
  updateMyAvailability,
};
