const Review = require("../models/Review");
const Invoice = require("../models/Invoice");
const Mechanic = require("../models/Mechanic");
const { getRatingSummaries, summaryFor } = require("./ratingSummary");

const idOf = (value) => value?._id?.toString() || value?.toString() || null;

// Turns populated ServiceRequest documents into plain objects and attaches:
//   review          - the customer's review of this request (if any)
//   invoice         - a short invoice summary (if issued)
//   mechanicProfile - the assigned mechanic's PROFILE (if any)
//
// Important: ServiceRequest.mechanicId references the USER collection, while
// experience / services / service area / verification live in the separate
// MECHANIC collection (keyed by userId). A plain populate() on mechanicId can
// therefore never return profile data, so the profile is looked up explicitly
// here with one batched query.
const serializeRequests = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  const plain = list.map((doc) => (doc.toObject ? doc.toObject() : { ...doc }));

  if (plain.length === 0) return Array.isArray(requests) ? [] : null;

  const requestIds = plain.map((request) => request._id);
  const mechanicUserIds = plain.map((r) => idOf(r.mechanicId)).filter(Boolean);

  const [reviews, invoices, profiles, ratings] = await Promise.all([
    Review.find({ requestId: { $in: requestIds } })
      .select("requestId rating comment createdAt")
      .lean(),
    Invoice.find({ requestId: { $in: requestIds } })
      .select("requestId invoiceNumber totalAmount currency issuedAt")
      .lean(),
    mechanicUserIds.length
      ? Mechanic.find({ userId: { $in: mechanicUserIds } })
          .select(
            "userId experienceYears services serviceArea bio verificationStatus isAvailable",
          )
          .lean()
      : [],
    getRatingSummaries(mechanicUserIds),
  ]);

  const reviewByRequest = new Map(reviews.map((r) => [r.requestId.toString(), r]));
  const invoiceByRequest = new Map(
    invoices.map((i) => [i.requestId.toString(), i]),
  );
  const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const result = plain.map((request) => {
    const mechanicUserId = idOf(request.mechanicId);
    const profile = mechanicUserId ? profileByUser.get(mechanicUserId) : null;
    const rating = mechanicUserId
      ? summaryFor(ratings, mechanicUserId)
      : { average: null, count: 0 };

    return {
      ...request,
      review: reviewByRequest.get(request._id.toString()) || null,
      invoice: invoiceByRequest.get(request._id.toString()) || null,
      mechanicProfile: profile
        ? {
            _id: profile._id,
            experienceYears: profile.experienceYears,
            services: profile.services,
            serviceArea: profile.serviceArea,
            bio: profile.bio,
            verificationStatus: profile.verificationStatus,
            isAvailable: profile.isAvailable,
            ratingAverage: rating.average,
            ratingCount: rating.count,
          }
        : null,
    };
  });

  return Array.isArray(requests) ? result : result[0];
};

module.exports = { serializeRequests };
