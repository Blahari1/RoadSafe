const { Resend } = require("resend");

let resendClientOverride = null;
let cachedClient = null;

const isEmailConfigured = (env = process.env) => {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM);
};

const missingEmailSettings = (env = process.env) => {
  const missing = [];

  if (!env.RESEND_API_KEY) {
    missing.push("RESEND_API_KEY");
  }

  if (!env.RESEND_FROM) {
    missing.push("RESEND_FROM");
  }

  return missing;
};

const getResendClient = (env = process.env) => {
  if (resendClientOverride) return resendClientOverride;

  if (!cachedClient) {
    cachedClient = new Resend(env.RESEND_API_KEY);
  }

  return cachedClient;
};

const sendPasswordResetOtp = async (
  { to, otp, expiresInMinutes },
  env = process.env,
) => {
  if (!isEmailConfigured(env)) {
    throw Object.assign(new Error("Resend email delivery is not configured"), {
      code: "EMAIL_NOT_CONFIGURED",
    });
  }

  const resend = getResendClient(env);

  const { data, error } = await resend.emails.send({
    from: env.RESEND_FROM,
    to: [to],
    subject: "Your RoadSafe password reset code",

    text:
      `Your RoadSafe password reset code is ${otp}.\n\n` +
      `It expires in ${expiresInMinutes} minutes and can be used once.\n` +
      "If you did not request this, you can ignore this email.\n" +
      "RoadSafe will never ask you for this code by phone or chat.",

    html:
      `<p>Your RoadSafe password reset code is:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p>` +
      `<p>It expires in ${expiresInMinutes} minutes and can be used once.</p>` +
      `<p>If you did not request this, you can ignore this email.</p>` +
      `<p>RoadSafe will never ask you for this code by phone or chat.</p>`,
  });

  if (error) {
    throw Object.assign(
      new Error(error.message || "Resend failed to send email"),
      { code: error.name || "RESEND_SEND_FAILED" },
    );
  }

  return data;
};

// Test hook
const __setResendForTests = (client) => {
  resendClientOverride = client;
  cachedClient = null;
};

module.exports = {
  isEmailConfigured,
  missingEmailSettings,
  sendPasswordResetOtp,
  __setResendForTests,
};
