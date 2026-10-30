const mongoose = require("mongoose");

// Fixed-window counters used by utils/rateLimit.js. Keys contain hashed
// identifiers (never raw emails). The TTL index only removes rate-limit rows.
const rateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  windowStart: { type: Date, required: true },
  lastHitAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.model("RateLimit", rateLimitSchema);
