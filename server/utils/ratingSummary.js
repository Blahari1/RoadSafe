const mongoose = require("mongoose");
const Review = require("../models/Review");

// Aggregates REAL reviews only. A mechanic with no reviews gets
// { average: null, count: 0 } - a rating is never invented.
const getRatingSummaries = async (mechanicUserIds) => {
  const ids = [...new Set(mechanicUserIds.map((id) => id.toString()))];
  const summaries = new Map();

  if (ids.length === 0) return summaries;

  const rows = await Review.aggregate([
    { $match: { mechanicUserId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    {
      $group: {
        _id: "$mechanicUserId",
        average: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  rows.forEach((row) => {
    summaries.set(row._id.toString(), {
      average: Math.round(row.average * 10) / 10,
      count: row.count,
    });
  });

  return summaries;
};

const summaryFor = (summaries, mechanicUserId) =>
  summaries.get(mechanicUserId.toString()) || { average: null, count: 0 };

module.exports = { getRatingSummaries, summaryFor };
