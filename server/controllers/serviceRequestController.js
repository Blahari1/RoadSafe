const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");
const Vehicle = require("../models/Vehicle");
const Mechanic = require("../models/Mechanic");
const Review = require("../models/Review");
const {
  SERVICE_TYPES,
  ACTIVE_STATUSES,
} = require("../utils/constants");
const { isValidLatitude, isValidLongitude } = require("../utils/geo");
const { evaluateEligibility } = require("../utils/eligibility");
const { validateReviewInput } = require("../utils/validators");
const { serializeRequests } = require("../utils/requestExtras");
const { notifyUser, pingMechanics, createPersistentNotification } = require("../utils/notify");

// Tells ELIGIBLE mechanics that a new request exists, using the same rules as
// the mechanic request list and the accept endpoint (approved, available,
// matching service, within the configured radius, missing-coordinate rules).
// Best-effort only: a socket problem never fails the request.
const notifyEligibleMechanics = async (req, serviceRequest) => {
  try {
    const mechanics = await Mechanic.find({
      verificationStatus: "approved",
      isAvailable: true,
      services: serviceRequest.serviceType,
    })
      .select("userId services location verificationStatus isAvailable")
      .populate("userId", "name");

    const vehicle = serviceRequest.vehicleId || null;
    const vehicleLabel = vehicle
      ? [vehicle.brand, vehicle.model, vehicle.vehicleNumber].filter(Boolean).join(" ")
      : "Vehicle details unavailable";

    const eligibleMechanics = mechanics.filter((mechanic) =>
      evaluateEligibility({ mechanic, request: serviceRequest }).eligible,
    );

    await Promise.all(
      eligibleMechanics.map(async (mechanic) => {
        // Preserve the existing lightweight event consumed by older dashboard
        // refresh logic; the durable event below powers the notification centre.
        notifyUser(req, mechanic.userId, {
          requestId: serviceRequest._id.toString(),
          status: "pending",
          message: `New ${serviceRequest.serviceType} request is waiting.`,
        });

        return createPersistentNotification(req, {
          recipientId: mechanic.userId?._id || mechanic.userId,
          recipientRole: "mechanic",
          type: "service_request_received",
          title: "New service request",
          message: "New service request received! A customer needs roadside assistance.",
          requestId: serviceRequest._id,
          link: "/mechanic/requests",
          dedupeKey: `request-offered:${serviceRequest._id}`,
          metadata: {
            serviceType: serviceRequest.serviceType,
            vehicle: vehicleLabel,
            location: serviceRequest.location?.address || "Location not provided",
            requestedAt: serviceRequest.createdAt,
          },
        });
      }),
    );
  } catch (error) {
    console.error("Mechanic notification error:", error.message);
  }
};

// POST /api/service-requests
const createServiceRequest = async (req, res) => {
  try {
    const { vehicleId, serviceType, problemDescription, location } = req.body;

    if (
      !vehicleId ||
      !serviceType ||
      typeof problemDescription !== "string" ||
      !problemDescription.trim() ||
      typeof location?.address !== "string" ||
      !location.address.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Vehicle, service type, problem description, and location are required",
      });
    }

    if (!mongoose.isValidObjectId(vehicleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vehicle ID",
      });
    }

    if (!SERVICE_TYPES.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type",
      });
    }

    const description = problemDescription.trim();
    const address = location.address.trim();

    if (description.length < 10 || description.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Problem description must contain 10 to 1000 characters",
      });
    }

    if (address.length > 250) {
      return res.status(400).json({
        success: false,
        message: "Location must not exceed 250 characters",
      });
    }

    const { latitude, longitude } = location;

    // Coordinates must either both be supplied or both be omitted.
    if ((latitude === undefined) !== (longitude === undefined)) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude must be provided together.",
      });
    }

    if (latitude !== undefined && !isValidLatitude(latitude)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude.",
      });
    }

    if (longitude !== undefined && !isValidLongitude(longitude)) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude.",
      });
    }

    // A customer can only request assistance for their own vehicle.
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      userId: req.user.userId,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found in your registered vehicles",
      });
    }

    // Duplicate-submission guard: one open request per vehicle at a time.
    const openRequest = await ServiceRequest.findOne({
      customerId: req.user.userId,
      vehicleId,
      status: { $in: ACTIVE_STATUSES },
    }).select("_id status");

    if (openRequest) {
      return res.status(409).json({
        success: false,
        message:
          "You already have an open assistance request for this vehicle. Check its status in Service History.",
        existingRequestId: openRequest._id,
      });
    }

    const serviceRequest = await ServiceRequest.create({
      customerId: req.user.userId,
      vehicleId,
      serviceType,
      problemDescription: description,
      location: {
        address,
        ...(latitude !== undefined && { latitude, longitude }),
      },
      status: "pending",
    });

    const populatedRequest = await ServiceRequest.findById(
      serviceRequest._id,
    ).populate("vehicleId");

    await notifyEligibleMechanics(req, populatedRequest);

    return res.status(201).json({
      success: true,
      message: "Roadside assistance request created successfully",
      serviceRequest: populatedRequest,
    });
  } catch (error) {
    console.error("Create service request error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create service request",
    });
  }
};

// GET /api/service-requests  (the logged-in customer's own requests only)
const getMyServiceRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({
      customerId: req.user.userId,
    })
      .populate("vehicleId")
      .populate({
        path: "mechanicId",
        select: "name phone",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      serviceRequests: await serializeRequests(requests),
    });
  } catch (error) {
    console.error("Get service requests error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve service requests",
    });
  }
};

// GET /api/service-requests/:id
const getServiceRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID",
      });
    }

    // Ownership is part of the query: another customer's id returns 404.
    const serviceRequest = await ServiceRequest.findOne({
      _id: id,
      customerId: req.user.userId,
    })
      .populate("vehicleId")
      .populate({
        path: "mechanicId",
        select: "name phone",
      });

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    return res.status(200).json({
      success: true,
      serviceRequest: await serializeRequests(serviceRequest),
    });
  } catch (error) {
    console.error("Get service request error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve service request",
    });
  }
};

// PATCH /api/service-requests/:id/cancel
const cancelServiceRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID",
      });
    }

    // Only the owner can cancel a request, and only while it is still pending.
    // The status check is part of the update, so a request that a mechanic has
    // just accepted cannot be cancelled by a racing click.
    const serviceRequest = await ServiceRequest.findOneAndUpdate(
      {
        _id: id,
        customerId: req.user.userId,
        status: "pending",
      },
      {
        $set: { status: "cancelled", cancelledAt: new Date() },
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate("vehicleId");

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        message: "Request not found, or it can no longer be cancelled",
      });
    }

    pingMechanics(req);

    return res.status(200).json({
      success: true,
      message: "Service request cancelled successfully",
      serviceRequest: await serializeRequests(serviceRequest),
    });
  } catch (error) {
    console.error("Cancel service request error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel service request",
    });
  }
};

// POST /api/service-requests/:id/review
// Body: { rating: 1-5, comment?: string }
// The reviewed mechanic is ALWAYS taken from the request itself, never from
// the request body, so a customer cannot review an unrelated mechanic.
const createReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID",
      });
    }

    const { error, value } = validateReviewInput(req.body);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    // Only the owning customer can find the request (others get 404).
    const serviceRequest = await ServiceRequest.findOne({
      _id: id,
      customerId: req.user.userId,
    });

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    if (serviceRequest.status !== "completed" || !serviceRequest.mechanicId) {
      return res.status(409).json({
        success: false,
        message: "Only completed services can be reviewed",
      });
    }

    if (await Review.exists({ requestId: serviceRequest._id })) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this service",
      });
    }

    let review;

    try {
      review = await Review.create({
        requestId: serviceRequest._id,
        customerId: req.user.userId,
        mechanicUserId: serviceRequest.mechanicId,
        rating: value.rating,
        comment: value.comment,
      });
    } catch (createError) {
      // The unique index on requestId catches simultaneous submissions.
      if (createError.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You have already reviewed this service",
        });
      }

      throw createError;
    }

    notifyUser(req, serviceRequest.mechanicId, {
      requestId: serviceRequest._id.toString(),
      status: serviceRequest.status,
      message: `A customer rated your service ${review.rating} out of 5.`,
    });

    return res.status(201).json({
      success: true,
      message: "Thank you. Your review has been saved.",
      review: {
        _id: review._id,
        requestId: review.requestId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    console.error("Create review error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to save your review",
    });
  }
};

module.exports = {
  createServiceRequest,
  getMyServiceRequests,
  getServiceRequestById,
  cancelServiceRequest,
  createReview,
  notifyEligibleMechanics,
};
