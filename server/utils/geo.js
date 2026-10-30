const isValidLatitude = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= -90 &&
  value <= 90;

const isValidLongitude = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= -180 &&
  value <= 180;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Great-circle (haversine) distance in kilometres. This is an approximate
// straight-line distance, NOT a driving distance or a travel-time estimate.
const distanceKm = (lat1, lon1, lat2, lon2) => {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;

  const safeA = Math.min(1, Math.max(0, a));

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
};

const roundKm = (value) => Number(value.toFixed(2));

const toDegrees = (radians) => (radians * 180) / Math.PI;

// Latitude/longitude rectangle that is GUARANTEED to contain every point within
// `radiusKm` of the centre (it may also contain some points slightly outside
// the circle; the exact haversine check is applied afterwards). It lets
// MongoDB use an index to narrow candidates instead of scanning everything.
//
// Returns { minLat, maxLat, lonRanges } where lonRanges is a list of
// [minLon, maxLon] pairs (two pairs when the box crosses the antimeridian) or
// null when every longitude must be considered (box reaches a pole, or is
// wider than the globe).
const boundingBox = (latitude, longitude, radiusKm) => {
  const earthRadiusKm = 6371;
  const margin = 0.001; // degrees of safety margin against rounding
  const angular = radiusKm / earthRadiusKm;
  const latDelta = toDegrees(angular) + margin;
  const minLat = Math.max(-90, latitude - latDelta);
  const maxLat = Math.min(90, latitude + latDelta);

  // Circle touches or contains a pole -> all longitudes are possible.
  if (latitude - latDelta <= -90 || latitude + latDelta >= 90) {
    return { minLat, maxLat, lonRanges: null };
  }

  const ratio = Math.sin(angular) / Math.cos(toRadians(latitude));

  if (!Number.isFinite(ratio) || ratio >= 1) {
    return { minLat, maxLat, lonRanges: null };
  }

  const lonDelta = toDegrees(Math.asin(ratio)) + margin;

  if (lonDelta >= 180) {
    return { minLat, maxLat, lonRanges: null };
  }

  const minLon = longitude - lonDelta;
  const maxLon = longitude + lonDelta;

  let lonRanges;

  if (minLon < -180) {
    lonRanges = [[minLon + 360, 180], [-180, maxLon]];
  } else if (maxLon > 180) {
    lonRanges = [[-180, maxLon - 360], [minLon, 180]];
  } else {
    lonRanges = [[minLon, maxLon]];
  }

  return { minLat, maxLat, lonRanges };
};

// MongoDB filter clauses (to be placed inside an $or) that match pinned
// requests whose stored coordinates fall inside the bounding box.
const boundingBoxClauses = (box) => {
  const latitude = { $gte: box.minLat, $lte: box.maxLat };

  if (!box.lonRanges) {
    return [{ "location.latitude": latitude }];
  }

  return box.lonRanges.map(([minLon, maxLon]) => ({
    "location.latitude": latitude,
    "location.longitude": { $gte: minLon, $lte: maxLon },
  }));
};

// MongoDB filter matching requests whose stored coordinates form a VALID pin:
// both numeric and within range. MongoDB range operators only match numeric
// values, so strings, null and missing fields do not match. This mirrors
// `isValidLatitude` / `isValidLongitude` (and so `evaluateEligibility`).
const validPinnedClause = () => ({
  "location.latitude": { $gte: -90, $lte: 90 },
  "location.longitude": { $gte: -180, $lte: 180 },
});

// MongoDB filter matching every request that is NOT a valid pin: no
// coordinates, only one coordinate, null, non-numeric, NaN, Infinity or out of
// range. `evaluateEligibility` treats all of these as "unpinned" (eligible,
// distance unknown), so the database prefilter must include exactly them.
const unpinnedClause = () => ({ $nor: [validPinnedClause()] });

module.exports = {
  validPinnedClause,
  unpinnedClause,
  isValidLatitude,
  isValidLongitude,
  distanceKm,
  roundKm,
  boundingBox,
  boundingBoxClauses,
};
