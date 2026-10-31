const ServiceRequest = require("../models/ServiceRequest");
const Mechanic = require("../models/Mechanic");
const { isObjectIdString } = require("../utils/ids");
const {
  getMaxRadiusKm,
  evaluateEligibility,
  REASON_MESSAGES,
} = require("../utils/eligibility");
const {
  isValidLatitude,
  isValidLongitude,
  boundingBox,
  boundingBoxClauses,
  validPinnedClause,
  unpinnedClause,
} = require("../utils/geo");
const { getMechanicTransition } = require("../utils/requestStatus");
const { serializeRequests } = require("../utils/requestExtras");
const { notifyUser, pingMechanics, createPersistentNotification } = require("../utils/notify");

// How many eligible requests one response contains. It is applied AFTER the
// eligibility rules and distance sort (never before), and the response reports
// totalEligible / truncated so nothing is omitted silently.
const MAX_LISTED_REQUESTS = 100;

const getMyMechanic = async (userId) => {
  return Mechanic.findOne({ userId });
};

// Conditionally returns THIS mechanic's own claim to the queue. The filter
// requires this mechanic and status "accepted", so it can never undo another
// mechanic's claim, and it is a no-op (null result) if the request has moved
// on. Tried twice to ride out a transient database error.
// Returns true when the claim is no longer held by this mechanic, false when
// the database could not be reached (the claim may still stand).
const releaseOwnClaim = async (requestId, mechanicUserId) => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await ServiceRequest.findOneAndUpdate(
        { _id: requestId, mechanicId: mechanicUserId, status: "accepted" },
        { $set: { status: "pending", mechanicId: null, acceptedAt: null } },
      );

      return true;
    } catch (error) {
      console.error(
        `Claim rollback attempt ${attempt} failed for request ${requestId}:`,
        error.message,
      );
    }
  }

  return false;
};

const notifyCustomer = (req, serviceRequest, message) => {
  const customerId =
    serviceRequest.customerId?._id?.toString() ||
    serviceRequest.customerId?.toString();

  notifyUser(req, customerId, {
    requestId: serviceRequest._id.toString(),
    status: serviceRequest.status,
    message,
    updatedAt: serviceRequest.updatedAt,
  });
};

// GET /api/mechanics/requests
// Returns:
//   availableRequests - pending requests matching this mechanic's services
//                       (only while the mechanic is available)
//   assignedRequests  - requests assigned to this mechanic
// Pending / rejected mechanics receive 403 with their verificationStatus so
// the client can show the correct waiting / rejected message.
const getMechanicRequests = async (req, res) => {
  try {
    const mechanic = await getMyMechanic(req.user.userId);

    if (!mechanic) {
      return res.status(404).json({
        success: false,
        message: "Mechanic profile not found.",
      });
    }

    if (mechanic.verificationStatus !== "approved") {
      return res.status(403).json({
        success: false,
        verificationStatus: mechanic.verificationStatus,
        message:
          mechanic.verificationStatus === "rejected"
            ? "Your mechanic profile was not approved, so you cannot view requests."
            : "Your mechanic profile is waiting for admin approval.",
      });
    }

    const maxRadiusKm = getMaxRadiusKm();
    const hasLocation =
      isValidLatitude(mechanic.location?.latitude) &&
      isValidLongitude(mechanic.location?.longitude);

    let availableRequests = [];
    let hiddenWithoutLocation = 0;
    let totalEligible = 0;

    if (mechanic.isAvailable) {
      // Step 1 - database pre-filter, deliberately WITHOUT a result limit:
      // pending + matching service + (NOT a valid pin OR a valid pin inside the
      // radius' bounding box). "Not a valid pin" deliberately covers every case
      // that evaluateEligibility treats as unpinned (missing, half-specified,
      // null, non-numeric, NaN/Infinity or out-of-range legacy coordinates), so
      // a request that notifications call eligible can never be filtered out
      // here. The box is a guaranteed superset of the radius circle, and the
      // index on status/serviceType/coordinates keeps the query cheap.
      const locationClauses = [unpinnedClause()];

      if (hasLocation) {
        locationClauses.push(
          ...boundingBoxClauses(
            boundingBox(
              mechanic.location.latitude,
              mechanic.location.longitude,
              maxRadiusKm,
            ),
          ),
        );
      }

      // Only the fields needed for the rules are loaded.
      const candidates = await ServiceRequest.find({
        status: "pending",
        serviceType: { $in: mechanic.services },
        $or: locationClauses,
      })
        .select("serviceType location createdAt")
        .lean();

      // Step 2 - exact rules (haversine radius, missing-coordinate handling).
      const eligible = candidates
        .map((request) => ({
          id: request._id,
          createdAt: request.createdAt,
          verdict: evaluateEligibility({ mechanic, request, maxRadiusKm }),
        }))
        .filter((entry) => entry.verdict.eligible)
        // Nearest first; unknown distances last; newest first within ties.
        .sort((x, y) => {
          const dx = x.verdict.distanceKm;
          const dy = y.verdict.distanceKm;

          if (dx !== null && dy !== null && dx !== dy) return dx - dy;
          if (dx === null && dy !== null) return 1;
          if (dx !== null && dy === null) return -1;

          return new Date(y.createdAt) - new Date(x.createdAt);
        });

      totalEligible = eligible.length;

      // Step 3 - cap the page AFTER filtering and sorting, then load and
      // populate full documents for just those requests.
      const page = eligible.slice(0, MAX_LISTED_REQUESTS);

      if (page.length > 0) {
        const docs = await ServiceRequest.find({
          _id: { $in: page.map((entry) => entry.id) },
        })
          .populate("customerId", "name phone")
          .populate("vehicleId");

        const serialized = await serializeRequests(docs);
        const byId = new Map(serialized.map((r) => [r._id.toString(), r]));

        availableRequests = page
          .map((entry) => {
            const request = byId.get(entry.id.toString());

            return request
              ? {
                  ...request,
                  // null (never a guess) when either location is unknown.
                  distanceKm: entry.verdict.distanceKm,
                  distanceKnown: entry.verdict.distanceKnown,
                }
              : null;
          })
          .filter(Boolean);
      }
    }

    if (!hasLocation) {
      // Pinned requests this mechanic cannot be matched to (no saved location).
      hiddenWithoutLocation = await ServiceRequest.countDocuments({
        status: "pending",
        serviceType: { $in: mechanic.services },
        ...validPinnedClause(),
      });
    }

    const assigned = await ServiceRequest.find({
      mechanicId: req.user.userId,
      status: { $in: ["accepted", "in_progress", "completed"] },
    })
      .populate("customerId", "name phone")
      .populate("vehicleId")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      isAvailable: mechanic.isAvailable,
      maxRadiusKm,
      // true when the mechanic has no saved coordinates: requests with a
      // pinned location are then hidden (counted below) until they add one.
      locationMissing: !hasLocation,
      hiddenWithoutLocation,
      totalEligible,
      listLimit: MAX_LISTED_REQUESTS,
      truncated: totalEligible > MAX_LISTED_REQUESTS,
      availableRequests,
      assignedRequests: await serializeRequests(assigned),
    });
  } catch (error) {
    console.error("Get mechanic requests error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load mechanic requests.",
    });
  }
};

// PATCH /api/mechanics/requests/:id/accept
const acceptServiceRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isObjectIdString(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID.",
      });
    }

    const mechanic = await getMyMechanic(req.user.userId);

    if (!mechanic || mechanic.verificationStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message: REASON_MESSAGES.not_approved,
      });
    }

    if (!mechanic.isAvailable) {
      return res.status(403).json({
        success: false,
        message: REASON_MESSAGES.not_available,
      });
    }

    // The conditions below are shared by the pre-check and the atomic update.
    const openFilter = {
      _id: id,
      status: "pending",
      mechanicId: null,
      serviceType: { $in: mechanic.services },
    };

    // Step 1: the same eligibility rules used for listing and notifications
    // (service type + radius + missing-coordinate handling).
    const candidate = await ServiceRequest.findOne(openFilter);

    if (!candidate) {
      return res.status(409).json({
        success: false,
        message:
          "This request is no longer available. It may have been accepted by another mechanic, cancelled, or is not one of your services.",
      });
    }

    const verdict = evaluateEligibility({ mechanic, request: candidate });

    if (!verdict.eligible) {
      return res.status(403).json({
        success: false,
        reason: verdict.reason,
        message: REASON_MESSAGES[verdict.reason] || "You cannot accept this request.",
      });
    }

    // Step 2: ONE atomic update. The filter (still pending, still unassigned)
    // and the change happen together in the database, so when several
    // mechanics click at the same moment exactly one update matches; every
    // other mechanic gets null here and a 409 below.
    const acceptedRequest = await ServiceRequest.findOneAndUpdate(
      openFilter,
      {
        $set: {
          mechanicId: req.user.userId,
          status: "accepted",
          acceptedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate("customerId", "name phone")
      .populate("mechanicId", "name phone")
      .populate("vehicleId");

    if (!acceptedRequest) {
      return res.status(409).json({
        success: false,
        message:
          "This request is no longer available. It may have been accepted by another mechanic, cancelled, or is not one of your services.",
      });
    }

    // Step 3 - re-validate AFTER claiming, FAIL-CLOSED. The mechanic's
    // availability, approval or location live in a different collection, so
    // they cannot be part of the single-document atomic update above. If they
    // changed between the pre-check and the claim, OR if eligibility cannot be
    // verified at all (the re-read fails), the mechanic's own claim is rolled
    // back. Nobody is notified until verification has passed.
    let verification;

    try {
      const fresh = await getMyMechanic(req.user.userId);

      verification = evaluateEligibility({
        mechanic: fresh,
        request: acceptedRequest,
      });
    } catch (verifyError) {
      console.error("Post-accept verification error:", verifyError.message);

      verification = {
        eligible: false,
        reason: "verification_unavailable",
        unverifiable: true,
      };
    }

    let eligibilityVerified = true;

    if (!verification.eligible) {
      const released = await releaseOwnClaim(id, req.user.userId);

      if (released) {
        pingMechanics(req);

        if (verification.unverifiable) {
          // Retryable: nothing is wrong with the mechanic or the request.
          return res.status(503).json({
            success: false,
            reason: "verification_unavailable",
            retryable: true,
            message:
              "We could not confirm your eligibility, so the request was returned to the queue. Please try again.",
          });
        }

        return res.status(409).json({
          success: false,
          reason: "eligibility_changed",
          message:
            "Your availability, approval or location changed while accepting, so the request was returned to the queue.",
        });
      }

      // The database could not be reached for the rollback either.
      if (!verification.unverifiable) {
        // Known to be ineligible AND cannot be released: report it truthfully.
        // The claim may still stand; the customer is NOT notified.
        return res.status(503).json({
          success: false,
          reason: "release_failed",
          retryable: false,
          message:
            "Your eligibility changed while accepting and the request could not be released automatically. Please contact support with the request ID.",
        });
      }

      // Could not verify AND could not roll back. The mechanic WAS eligible at
      // the pre-check a moment ago and the claim is stored, so the truthful
      // outcome is "accepted"; leaving a stored claim that nobody was told
      // about would be worse. Flag it in the response.
      eligibilityVerified = false;
    }

    notifyCustomer(
      req,
      acceptedRequest,
      "Your service request has been accepted! Your mechanic is on the way.",
    );

    await createPersistentNotification(req, {
      recipientId: acceptedRequest.customerId?._id || acceptedRequest.customerId,
      recipientRole: "customer",
      type: "service_request_accepted",
      title: "Mechanic accepted your request",
      message: "Your service request has been accepted! Your mechanic is on the way.",
      requestId: acceptedRequest._id,
      link: `/service-history/${acceptedRequest._id}`,
      dedupeKey: `request-accepted:${acceptedRequest._id}`,
      metadata: {
        mechanicName: acceptedRequest.mechanicId?.name || "Your assigned mechanic",
        serviceType: acceptedRequest.serviceType,
        acceptedAt: acceptedRequest.acceptedAt,
      },
    });
    pingMechanics(req);

    return res.status(200).json({
      success: true,
      message: "Service request accepted successfully.",
      eligibilityVerified,
      serviceRequest: await serializeRequests(acceptedRequest),
    });
  } catch (error) {
    console.error("Accept service request error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to accept this request.",
    });
  }
};

// PATCH /api/mechanics/requests/:id/status   body: { status }
const updateServiceRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!isObjectIdString(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID.",
      });
    }

    const transition = getMechanicTransition(status);

    if (!transition) {
      return res.status(400).json({
        success: false,
        message: "Allowed updates are in_progress or completed.",
      });
    }

    const mechanic = await getMyMechanic(req.user.userId);

    if (!mechanic || mechanic.verificationStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Only approved mechanics can update requests.",
      });
    }

    const updatedRequest = await ServiceRequest.findOneAndUpdate(
      {
        _id: id,
        mechanicId: req.user.userId,
        status: transition.from,
      },
      { $set: { status, [transition.timestampField]: new Date() } },
      { returnDocument: "after", runValidators: true },
    )
      .populate("customerId", "name phone")
      .populate("vehicleId");

    if (!updatedRequest) {
      return res.status(409).json({
        success: false,
        message:
          "Request not found, not assigned to you, or the status transition is not allowed.",
      });
    }

    const statusMessages = {
      in_progress: "Your roadside assistance is now in progress.",
      completed:
        "Your service request has been completed. You can now rate the service.",
    };

    notifyCustomer(
      req,
      updatedRequest,
      statusMessages[updatedRequest.status] ||
        "Your service request has been updated.",
    );

    return res.status(200).json({
      success: true,
      message: `Request marked as ${status.replace("_", " ")}.`,
      serviceRequest: await serializeRequests(updatedRequest),
    });
  } catch (error) {
    console.error("Update service request status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update service request status.",
    });
  }
};

module.exports = {
  getMechanicRequests,
  acceptServiceRequest,
  updateServiceRequestStatus,
};
