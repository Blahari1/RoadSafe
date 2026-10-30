const mongoose = require("mongoose");

// One record per password-reset attempt. Only HASHES are stored: the OTP is
// HMAC-hashed and the reset token is SHA-256 hashed; neither is ever stored or
// returned in plaintext.
//
// Lifecycle:  created (OTP sent) -> verifiedAt set (OTP correct, reset token
// issued) -> usedAt set (password changed). Each transition is a single atomic
// conditional update, so a code or token can only be redeemed once.
const passwordResetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true }, // OTP expiry (5 minutes)
    attempts: { type: Number, default: 0 }, //    wrong/any guesses so far

    verifiedAt: { type: Date, default: null },
    resetTokenHash: { type: String, default: null, index: true },
    resetTokenExpiresAt: { type: Date, default: null },

    usedAt: { type: Date, default: null },

    // MongoDB deletes THIS collection's documents shortly after `purgeAt`.
    // The TTL index lives only on this collection and never touches users.
    // Expiry is ALSO enforced explicitly in every query (TTL runs ~every 60s).
    purgeAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
