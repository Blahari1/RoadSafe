const mongoose = require("mongoose");
const Mechanic = require("../models/Mechanic");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const ServiceRequest = require("../models/ServiceRequest");
const Review = require("../models/Review");
const Invoice = require("../models/Invoice");
const {
  SERVICE_TYPES,
  REQUEST_STATUSES,
} = require("../utils/constants");
const { escapeRegex, parsePagination } = require("../utils/validators");
const { serializeRequests } = require("../utils/requestExtras");
const { getRatingSummaries, summaryFor } = require("../utils/ratingSummary");

// GET /api/admin/overview
// Every number is computed from the database at request time.
const getOverview = async (req, res) => {
  try {
    const [
      totalCustomers,
      totalMechanics,
      pendingMechanics,
      approvedMechanics,
      rejectedMechanics,
      statusRows,
      totalReviews,
      totalInvoices,
    ] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      Mechanic.countDocuments(),
      Mechanic.countDocuments({ verificationStatus: "pending" }),
      Mechanic.countDocuments({ verificationStatus: "approved" }),
      Mechanic.countDocuments({ verificationStatus: "rejected" }),
      ServiceRequest.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Review.countDocuments(),
      Invoice.countDocuments(),
    ]);

    const requestsByStatus = Object.fromEntries(
      REQUEST_STATUSES.map((status) => [status, 0]),
    );

    statusRows.forEach((row) => {
      if (row._id in requestsByStatus) requestsByStatus[row._id] = row.count;
    });

    const totalRequests = Object.values(requestsByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );

    return res.status(200).json({
      success: true,
      stats: {
        totalCustomers,
        totalMechanics,
        pendingMechanics,
        approvedMechanics,
        rejectedMechanics,
        totalRequests,
        pendingRequests: requestsByStatus.pending,
        acceptedRequests: requestsByStatus.accepted,
        inProgressRequests: requestsByStatus.in_progress,
        completedRequests: requestsByStatus.completed,
        cancelledRequests: requestsByStatus.cancelled,
        totalReviews,
        totalInvoices,
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load overview statistics",
    });
  }
};

// GET /api/admin/mechanics?status=pending
const getMechanics = async (req, res) => {
  try {
    const allowedStatuses = ["pending", "approved", "rejected"];
    const { status } = req.query;

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification status",
      });
    }

    const filter = status ? { verificationStatus: status } : {};

    const mechanics = await Mechanic.find(filter)
      .populate("userId", "name email phone role")
      .sort({ createdAt: -1 });

    const ratings = await getRatingSummaries(
      mechanics.filter((m) => m.userId?._id).map((m) => m.userId._id),
    );

    return res.status(200).json({
      success: true,
      count: mechanics.length,
      mechanics: mechanics.map((mechanic) => {
        const rating = mechanic.userId?._id
          ? summaryFor(ratings, mechanic.userId._id)
          : { average: null, count: 0 };

        return {
          ...mechanic.toObject(),
          ratingAverage: rating.average,
          ratingCount: rating.count,
        };
      }),
    });
  } catch (error) {
    console.error("Get mechanics error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve mechanic profiles",
    });
  }
};

// PATCH /api/admin/mechanics/:id/verification
const updateMechanicVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mechanic profile ID",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or rejected",
      });
    }

    const mechanic = await Mechanic.findById(id);

    if (!mechanic) {
      return res.status(404).json({
        success: false,
        message: "Mechanic profile not found",
      });
    }

    mechanic.verificationStatus = status;

    // Approval does not automatically mean the mechanic
    // is available to accept roadside assistance requests.
    mechanic.isAvailable = false;

    await mechanic.save();

    const updatedMechanic = await Mechanic.findById(mechanic._id).populate(
      "userId",
      "name email phone role",
    );

    return res.status(200).json({
      success: true,
      message: `Mechanic profile ${status} successfully`,
      mechanic: updatedMechanic,
    });
  } catch (error) {
    console.error("Update verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update verification status",
    });
  }
};

// Builds the Mongo filter for the request-history page.
// Search covers: request ID (full or partial hex), customer / mechanic name,
// email or phone, and the breakdown address.
const buildRequestFilter = async ({ status, serviceType, search }) => {
  const filter = {};

  if (status) filter.status = status;
  if (serviceType) filter.serviceType = serviceType;

  const term = typeof search === "string" ? search.trim().slice(0, 100) : "";

  if (term) {
    const regex = new RegExp(escapeRegex(term), "i");
    const clauses = [{ "location.address": regex }];

    if (/^[0-9a-f]{4,24}$/i.test(term)) {
      clauses.push({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: term.toLowerCase(),
          },
        },
      });
    }

    const users = await User.find({
      $or: [{ name: regex }, { email: regex }, { phone: regex }],
    })
      .select("_id role")
      .limit(200)
      .lean();

    const customerIds = users.filter((u) => u.role === "customer").map((u) => u._id);
    const mechanicIds = users.filter((u) => u.role === "mechanic").map((u) => u._id);

    if (customerIds.length) clauses.push({ customerId: { $in: customerIds } });
    if (mechanicIds.length) clauses.push({ mechanicId: { $in: mechanicIds } });

    filter.$or = clauses;
  }

  return filter;
};

const populateRequests = (query) =>
  query
    .populate("customerId", "name email phone createdAt")
    .populate("vehicleId")
    // mechanicId references the USER collection, so this returns the user's
    // name/contact. Profile data is attached by serializeRequests().
    .populate("mechanicId", "name email phone");

// GET /api/admin/service-requests?status=&serviceType=&search=&page=&limit=
// Read-only: administrators can view history and assignments across ALL
// customers but cannot change assignments or statuses from here.
const getAllServiceRequests = async (req, res) => {
  try {
    const { status, serviceType, search } = req.query;

    if (status && !REQUEST_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request status",
      });
    }

    if (serviceType && !SERVICE_TYPES.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type",
      });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = await buildRequestFilter({ status, serviceType, search });

    const [requests, total] = await Promise.all([
      populateRequests(
        ServiceRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ),
      ServiceRequest.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      serviceRequests: await serializeRequests(requests),
    });
  } catch (error) {
    console.error("Admin get requests error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve service requests",
    });
  }
};

// GET /api/admin/service-requests/:id
const getServiceRequestForAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID",
      });
    }

    const request = await populateRequests(ServiceRequest.findById(id));

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    return res.status(200).json({
      success: true,
      serviceRequest: await serializeRequests(request),
    });
  } catch (error) {
    console.error("Admin get request error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve the service request",
    });
  }
};

// GET /api/admin/customers?search=&page=&limit=
// Passwords and tokens are never selected.
const getCustomers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const term =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const filter = { role: "customer" };

    if (term) {
      const regex = new RegExp(escapeRegex(term), "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select("name email phone createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const ids = customers.map((customer) => customer._id);

    const [requestCounts, vehicleCounts] = await Promise.all([
      ServiceRequest.aggregate([
        { $match: { customerId: { $in: ids } } },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ]),
      Vehicle.aggregate([
        { $match: { userId: { $in: ids } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
    ]);

    const requestMap = new Map(requestCounts.map((r) => [r._id.toString(), r.count]));
    const vehicleMap = new Map(vehicleCounts.map((v) => [v._id.toString(), v.count]));

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      customers: customers.map((customer) => ({
        ...customer,
        requestCount: requestMap.get(customer._id.toString()) || 0,
        vehicleCount: vehicleMap.get(customer._id.toString()) || 0,
      })),
    });
  } catch (error) {
    console.error("Admin get customers error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve customers",
    });
  }
};

module.exports = {
  getOverview,
  getMechanics,
  updateMechanicVerification,
  getAllServiceRequests,
  getServiceRequestForAdmin,
  getCustomers,
};
