const Mechanic = require("../models/Mechanic");
const { SERVICE_TYPES } = require("../utils/constants");
const { isValidLatitude, isValidLongitude } = require("../utils/geo");
const { getMaxRadiusKm, evaluateEligibility } = require("../utils/eligibility");
const { getRatingSummaries, summaryFor } = require("../utils/ratingSummary");

// GET /api/mechanics/nearby?lat=&lng=&serviceType=&radiusKm=
// Customers only. Returns approved AND available mechanics that offer the
// service and have a saved location, ordered by approximate straight-line
// distance. Distances are NOT driving distances and are NOT ETAs.
const getNearbyMechanics = async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const serviceType = req.query.serviceType;
    const maxRadiusKm = getMaxRadiusKm();
    const requestedRadius =
      req.query.radiusKm === undefined ? maxRadiusKm : Number(req.query.radiusKm);

    if (
      req.query.lat === undefined ||
      req.query.lng === undefined ||
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required.",
      });
    }

    if (!Number.isFinite(requestedRadius) || requestedRadius <= 0) {
      return res.status(400).json({
        success: false,
        message: "Radius must be greater than 0.",
      });
    }

    // The customer may narrow the search but never widen it beyond the
    // platform radius that mechanics themselves are limited to, so results
    // here match who could actually accept the request.
    const radiusKm = Math.min(requestedRadius, maxRadiusKm);

    if (serviceType && !SERVICE_TYPES.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type.",
      });
    }

    const filter = {
      verificationStatus: "approved",
      isAvailable: true,
      "location.latitude": { $exists: true, $ne: null },
      "location.longitude": { $exists: true, $ne: null },
    };

    if (serviceType) {
      filter.services = serviceType;
    }

    const mechanics = await Mechanic.find(filter)
      .populate("userId", "name phone")
      .lean();

    const ratings = await getRatingSummaries(
      mechanics.filter((m) => m.userId?._id).map((m) => m.userId._id),
    );

    // Same rules as accepting: a mechanic is listed only if they could accept
    // a request pinned at the searched point. When no service type is chosen,
    // any one of the mechanic's own services counts as a match.
    const nearbyMechanics = mechanics
      .filter(
        (mechanic) =>
          mechanic.userId &&
          Array.isArray(mechanic.services) &&
          mechanic.services.length > 0,
      )
      .map((mechanic) => ({
        mechanic,
        verdict: evaluateEligibility({
          mechanic,
          request: {
            serviceType: serviceType || mechanic.services[0],
            location: { latitude, longitude },
          },
          maxRadiusKm: radiusKm,
        }),
      }))
      .filter(({ verdict }) => verdict.eligible)
      .map(({ mechanic, verdict }) => {
        const rating = summaryFor(ratings, mechanic.userId._id);

        return {
          ...mechanic,
          distanceKm: verdict.distanceKm,
          // null / 0 when the mechanic has no real reviews yet.
          ratingAverage: rating.average,
          ratingCount: rating.count,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return res.status(200).json({
      success: true,
      count: nearbyMechanics.length,
      radiusKm,
      maxRadiusKm,
      radiusCapped: requestedRadius > maxRadiusKm,
      mechanics: nearbyMechanics,
    });
  } catch (error) {
    console.error("Nearby mechanics error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to find nearby mechanics.",
    });
  }
};

module.exports = { getNearbyMechanics };
