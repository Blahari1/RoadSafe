const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const { consume } = require("../utils/rateLimit");
const { validateNewPassword } = require("../utils/passwordPolicy");
const {
  isEmailConfigured,
  missingEmailSettings,
  sendPasswordResetOtp,
} = require("../utils/mailer");
const {
  OTP_LENGTH,
  OTP_TTL_MS,
  MAX_OTP_ATTEMPTS,
  RESET_TOKEN_TTL_MS,
  RECORD_PURGE_MS,
  generateOtp,
  generateResetToken,
  hashOtp,
  hashToken,
  safeEqualHex,
  normalizeEmail,
} = require("../utils/otp");

const HOUR = 60 * 60 * 1000;
const QUARTER_HOUR = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Rate limits. Email-keyed limits use a hash of the address and apply whether
// or not an account exists, so hitting them reveals nothing about accounts.
const LIMITS = {
  forgotIp: { limit: 10, windowMs: HOUR },
  forgotEmail: { limit: 5, windowMs: HOUR, minIntervalMs: RESEND_COOLDOWN_MS },
  verifyIp: { limit: 30, windowMs: QUARTER_HOUR },
  verifyEmail: { limit: 15, windowMs: QUARTER_HOUR },
  resetIp: { limit: 20, windowMs: QUARTER_HOUR },
};

const GENERIC_SENT_MESSAGE =
  "If an account exists for that email address, we have sent a 6-digit verification code. It expires in 5 minutes.";

// One message for wrong, expired, already-used and exhausted codes, so the
// response never reveals which case (or whether the account exists).
const INVALID_CODE_MESSAGE =
  "That code is invalid or has expired. Request a new code and try again.";

const INVALID_SESSION_MESSAGE =
  "This password reset session is invalid or has expired. Please start again.";

const emailKey = (email) =>
  crypto.createHash("sha256").update(email).digest("hex");

const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";

// Returns true when the request was blocked (a 429 has already been sent).
const blocked = async (req, res, checks) => {
  for (const [key, options] of checks) {
    const result = await consume(key, options);

    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfterSeconds));
      res.status(429).json({
        success: false,
        message: "Too many attempts. Please wait before trying again.",
        retryAfterSeconds: result.retryAfterSeconds,
      });

      return true;
    }
  }

  return false;
};

// Emails still being sent in the background (lets tests wait for them).
const pendingEmails = new Set();

// POST /api/auth/forgot-password   { email }
const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    // Independent of the email address, so it cannot be used to probe accounts.
    if (!isEmailConfigured()) {
      console.error(
        "Password reset unavailable: email is not configured. Missing/invalid:",
        missingEmailSettings().join(", "),
      );

      return res.status(503).json({
        success: false,
        code: "EMAIL_NOT_CONFIGURED",
        message:
          "Password reset by email is not available because the server's email service is not configured. Please contact the administrator.",
      });
    }

    if (
      await blocked(req, res, [
        [`forgot:ip:${clientIp(req)}`, LIMITS.forgotIp],
        [`forgot:email:${emailKey(email)}`, LIMITS.forgotEmail],
      ])
    ) {
      return undefined;
    }

    const user = await User.findOne({ email }).select("_id");

    if (user) {
      const otp = generateOtp();
      const now = Date.now();

      // Only the newest code is valid: drop any earlier attempt for this user.
      await PasswordReset.deleteMany({ userId: user._id });

      const record = await PasswordReset.create({
        userId: user._id,
        otpHash: hashOtp(otp, user._id.toString()),
        expiresAt: new Date(now + OTP_TTL_MS),
        purgeAt: new Date(now + RECORD_PURGE_MS),
      });

      // Sent in the background so the response (and its timing) is the same
      // whether or not an account exists, and a failure cannot reveal it.
      // If delivery fails the code can never reach anyone, so it is removed.
      const sending = sendPasswordResetOtp({
        to: email,
        otp,
        expiresInMinutes: OTP_TTL_MS / 60000,
      })
        .catch(async (error) => {
          // Never log the OTP, the address or SMTP settings; only an error code.
          console.error(
            "Password reset email delivery failed:",
            error.code || error.responseCode || error.name || "unknown error",
          );

          try {
            await PasswordReset.deleteOne({ _id: record._id });
          } catch (cleanupError) {
            console.error("Password reset cleanup failed:", cleanupError.name);
          }
        })
        .finally(() => pendingEmails.delete(sending));

      pendingEmails.add(sending);
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_SENT_MESSAGE,
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error("Forgot password error:", error.name);

    return res.status(500).json({
      success: false,
      message: "Unable to process the request. Please try again later.",
    });
  }
};

// POST /api/auth/verify-reset-otp   { email, otp }
// On success returns a one-time reset token that is required by the final step.
const verifyResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = req.body?.otp;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (typeof otp !== "string" || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
      return res.status(400).json({
        success: false,
        message: `Enter the ${OTP_LENGTH}-digit code from your email`,
      });
    }

    if (
      await blocked(req, res, [
        [`verify:ip:${clientIp(req)}`, LIMITS.verifyIp],
        [`verify:email:${emailKey(email)}`, LIMITS.verifyEmail],
      ])
    ) {
      return undefined;
    }

    const invalid = () =>
      res.status(400).json({ success: false, message: INVALID_CODE_MESSAGE });

    const user = await User.findOne({ email }).select("_id");

    if (!user) return invalid();

    const now = new Date();

    // Count the attempt BEFORE comparing, in the same atomic operation that
    // checks the limit. Parallel guesses therefore cannot exceed the maximum:
    // once attempts reaches 5 the record no longer matches this filter.
    const record = await PasswordReset.findOneAndUpdate(
      {
        userId: user._id,
        usedAt: null,
        verifiedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: MAX_OTP_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
      { new: true },
    );

    if (!record) return invalid();

    if (!safeEqualHex(record.otpHash, hashOtp(otp, user._id.toString()))) {
      return invalid();
    }

    // Redeem the OTP: only ONE concurrent request can flip verifiedAt from null.
    const resetToken = generateResetToken();

    const verified = await PasswordReset.findOneAndUpdate(
      {
        _id: record._id,
        usedAt: null,
        verifiedAt: null,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          verifiedAt: now,
          resetTokenHash: hashToken(resetToken),
          resetTokenExpiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
        },
      },
      { new: true },
    );

    if (!verified) return invalid();

    return res.status(200).json({
      success: true,
      message: "Code verified. You can now choose a new password.",
      resetToken,
      expiresInSeconds: RESET_TOKEN_TTL_MS / 1000,
    });
  } catch (error) {
    console.error("Verify reset OTP error:", error.name);

    return res.status(500).json({
      success: false,
      message: "Unable to verify the code. Please try again later.",
    });
  }
};

// POST /api/auth/reset-password   { resetToken, newPassword, confirmPassword }
const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body || {};

    if (typeof resetToken !== "string" || !/^[a-f0-9]{64}$/.test(resetToken)) {
      return res.status(400).json({ success: false, message: INVALID_SESSION_MESSAGE });
    }

    if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const strength = validateNewPassword(newPassword);

    if (strength.error) {
      // The token is NOT consumed: the user can fix the password and retry.
      return res.status(400).json({ success: false, message: strength.error });
    }

    if (await blocked(req, res, [[`reset:ip:${clientIp(req)}`, LIMITS.resetIp]])) {
      return undefined;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    // Redeem the token: a single atomic conditional update. Of any number of
    // concurrent requests carrying the same token, exactly one matches.
    const record = await PasswordReset.findOneAndUpdate(
      {
        resetTokenHash: hashToken(resetToken),
        verifiedAt: { $ne: null },
        usedAt: null,
        resetTokenExpiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
      { new: true },
    );

    if (!record) {
      return res.status(400).json({ success: false, message: INVALID_SESSION_MESSAGE });
    }

    let result;

    try {
      // ONLY these two fields change: role, profile and mechanic verification
      // are untouched, and nothing from the request body reaches the update.
      result = await User.updateOne(
        { _id: record.userId },
        { $set: { password: passwordHash, passwordChangedAt: now } },
      );
    } catch (updateError) {
      // Give the token back so the user can retry (only if still ours).
      await PasswordReset.updateOne(
        { _id: record._id, usedAt: now },
        { $set: { usedAt: null } },
      ).catch(() => {});

      throw updateError;
    }

    if (!result || result.matchedCount === 0) {
      return res.status(400).json({ success: false, message: INVALID_SESSION_MESSAGE });
    }

    await PasswordReset.deleteMany({ userId: record.userId });

    // Drop live Socket.IO connections: their tokens predate the new password.
    try {
      req.app?.get("io")?.in(`user:${record.userId}`).disconnectSockets(true);
    } catch (socketError) {
      console.error("Socket disconnect after reset failed:", socketError.name);
    }

    return res.status(200).json({
      success: true,
      message: "Your password has been reset. Please log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error.name);

    return res.status(500).json({
      success: false,
      message: "Unable to reset the password. Please try again later.",
    });
  }
};

// Resolves when background emails have settled (used by tests only).
const __settleEmails = () => Promise.allSettled([...pendingEmails]);

module.exports = {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  __settleEmails,
};
