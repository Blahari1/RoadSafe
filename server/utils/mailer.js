// Password-reset email delivery over SMTP (Nodemailer).
//
// All credentials come from environment variables. Nothing here logs or
// returns the OTP, the SMTP password, or the full transport configuration.
let transportOverride = null; // tests inject a fake transport here
let cachedTransport = null;

const parseBool = (value) => String(value).trim().toLowerCase() === "true";

// SMTP is "configured" when host, port and sender are present and, if either
// credential is given, both are.
const isEmailConfigured = (env = process.env) => {
  const port = Number(env.SMTP_PORT);
  const hasUser = Boolean(env.SMTP_USER);
  const hasPass = Boolean(env.SMTP_PASS);

  return Boolean(
    env.SMTP_HOST &&
      Number.isInteger(port) &&
      port > 0 &&
      port < 65536 &&
      env.SMTP_FROM &&
      hasUser === hasPass,
  );
};

const missingEmailSettings = (env = process.env) => {
  const missing = [];

  if (!env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!Number.isInteger(Number(env.SMTP_PORT)) || Number(env.SMTP_PORT) <= 0) {
    missing.push("SMTP_PORT");
  }
  if (!env.SMTP_FROM) missing.push("SMTP_FROM");
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) {
    missing.push("SMTP_USER and SMTP_PASS (set both or neither)");
  }

  return missing;
};

const getTransport = (env = process.env) => {
  if (transportOverride) return transportOverride;
  if (cachedTransport) return cachedTransport;

  // Loaded lazily so the rest of the API (and the unit tests) work without it.
  const nodemailer = require("nodemailer");

  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: parseBool(env.SMTP_SECURE), // true for 465, false for 587/STARTTLS
    ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return cachedTransport;
};

const sendPasswordResetOtp = async ({ to, otp, expiresInMinutes }, env = process.env) => {
  if (!isEmailConfigured(env)) {
    throw Object.assign(new Error("Email delivery is not configured"), {
      code: "EMAIL_NOT_CONFIGURED",
    });
  }

  await getTransport(env).sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Your RoadSafe password reset code",
    text:
      `Your RoadSafe password reset code is ${otp}.\n\n` +
      `It expires in ${expiresInMinutes} minutes and can be used once.\n` +
      "If you did not request this, you can ignore this email: your password has not been changed.\n" +
      "RoadSafe will never ask you for this code by phone or chat.",
    html:
      `<p>Your RoadSafe password reset code is:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p>` +
      `<p>It expires in ${expiresInMinutes} minutes and can be used once.</p>` +
      `<p>If you did not request this, you can ignore this email: your password has not been changed.</p>` +
      `<p>RoadSafe will never ask you for this code by phone or chat.</p>`,
  });
};

// Test hooks.
const __setTransportForTests = (transport) => {
  transportOverride = transport;
  cachedTransport = null;
};

module.exports = {
  isEmailConfigured,
  missingEmailSettings,
  sendPasswordResetOtp,
  __setTransportForTests,
};
