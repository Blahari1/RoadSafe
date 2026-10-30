const { isValidLatitude, isValidLongitude, distanceKm, roundKm } = require("./geo");

// ---------------------------------------------------------------------------
// ONE set of rules that decides whether a mechanic may be offered / may accept
// a request. The mechanic request list, the accept endpoint, new-request
// notifications and the customer "nearby mechanics" search ALL call this, so
// they cannot disagree.
//
// A mechanic is eligible for a request when ALL of these hold:
//   1. verificationStatus is "approved"
//   2. isAvailable is true
//   3. the request's serviceType is one of the mechanic's services
//   4. distance rule (straight-line / haversine, NOT driving distance):
//        - request pinned AND mechanic located -> distance <= max radius
//        - request has NO coordinates          -> eligible, distance unknown
//          (nobody could be distance-checked; hiding it would strand the
//           customer). The distance is reported as null, never invented.
//        - request pinned, mechanic has NO coordinates -> NOT eligible
//          ("mechanic_location_missing"). The mechanic must save a service
//          location in their profile to receive pinned requests.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RADIUS_KM = 25;
const MAX_ALLOWED_RADIUS_KM = 500;

// Reads MECHANIC_MAX_RADIUS_KM at call time. Invalid / missing -> default.
const getMaxRadiusKm = (env = process.env) => {
  const parsed = Number(env.MECHANIC_MAX_RADIUS_KM);

  if (
    env.MECHANIC_MAX_RADIUS_KM === undefined ||
    env.MECHANIC_MAX_RADIUS_KM === "" ||
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return DEFAULT_MAX_RADIUS_KM;
  }

  return Math.min(parsed, MAX_ALLOWED_RADIUS_KM);
};

const pointOf = (location) => {
  const latitude = location?.latitude;
  const longitude = location?.longitude;

  return isValidLatitude(latitude) && isValidLongitude(longitude)
    ? { latitude, longitude }
    : null;
};

// Returns { eligible, reason, distanceKm, distanceKnown }.
// `reason` is null when eligible, otherwise one of:
//   not_approved | not_available | service_mismatch |
//   mechanic_location_missing | out_of_range
const evaluateEligibility = ({
  mechanic,
  request,
  maxRadiusKm = getMaxRadiusKm(),
}) => {
  const result = (eligible, reason, km = null) => ({
    eligible,
    reason,
    distanceKm: km,
    distanceKnown: km !== null,
  });

  if (!mechanic || mechanic.verificationStatus !== "approved") {
    return result(false, "not_approved");
  }

  if (mechanic.isAvailable !== true) {
    return result(false, "not_available");
  }

  if (
    !request ||
    !Array.isArray(mechanic.services) ||
    !mechanic.services.includes(request.serviceType)
  ) {
    return result(false, "service_mismatch");
  }

  const requestPoint = pointOf(request.location);

  if (!requestPoint) {
    // No pin on the request: distance cannot be known for anyone.
    return result(true, null, null);
  }

  const mechanicPoint = pointOf(mechanic.location);

  if (!mechanicPoint) {
    return result(false, "mechanic_location_missing");
  }

  const km = roundKm(
    distanceKm(
      mechanicPoint.latitude,
      mechanicPoint.longitude,
      requestPoint.latitude,
      requestPoint.longitude,
    ),
  );

  return km <= maxRadiusKm
    ? result(true, null, km)
    : result(false, "out_of_range", km);
};

const REASON_MESSAGES = {
  not_approved: "Only approved mechanics can accept requests.",
  not_available: "Set yourself as available before accepting requests.",
  service_mismatch: "This request is not one of your registered services.",
  mechanic_location_missing:
    "Save your service location in your profile to accept requests that have a pinned location.",
  out_of_range: "This request is outside your service radius.",
};

module.exports = {
  DEFAULT_MAX_RADIUS_KM,
  MAX_ALLOWED_RADIUS_KM,
  getMaxRadiusKm,
  evaluateEligibility,
  REASON_MESSAGES,
};
