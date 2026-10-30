const crypto = require("node:crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; //        OTP valid for 5 minutes
const MAX_OTP_ATTEMPTS = 5; //              wrong guesses allowed per OTP
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // time allowed to set the new password
const RECORD_PURGE_MS = 60 * 60 * 1000; //  TTL cleanup of used/expired records

// Uniformly random 6-digit code from the OS CSPRNG (never Math.random).
const generateOtp = () =>
  String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");

// 256-bit random token handed to the client after the OTP is verified.
const generateResetToken = () => crypto.randomBytes(32).toString("hex");

const getSecret = (env = process.env) => {
  const secret = env.OTP_HMAC_SECRET || env.JWT_SECRET;

  if (!secret) {
    throw new Error("OTP_HMAC_SECRET or JWT_SECRET must be set");
  }

  return secret;
};

// HMAC-SHA256(secret, userId:otp). A plain hash of a 6-digit code could be
// brute-forced offline in microseconds if the database leaked; keying it with
// a server-side secret prevents that. Binding the user id means the same code
// for two users produces different hashes.
const hashOtp = (otp, userId, env = process.env) =>
  crypto
    .createHmac("sha256", getSecret(env))
    .update(`${userId}:${otp}`)
    .digest("hex");

// Reset tokens already have 256 bits of entropy, so a plain SHA-256 is enough.
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const safeEqualHex = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the normalised email or null when it is not a plausible address.
const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();

  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email)
    ? email
    : null;
};

module.exports = {
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
};
