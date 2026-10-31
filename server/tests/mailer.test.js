const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isEmailConfigured,
  missingEmailSettings,
  sendPasswordResetOtp,
  __setResendForTests,
} = require("../utils/mailer");

const { validateNewPassword } = require("../utils/passwordPolicy");

const GOOD = {
  RESEND_API_KEY: "re_test_fake_key",
  RESEND_FROM: "RoadSafe <onboarding@resend.dev>",
};

test("email configuration requires Resend API key and sender", () => {
  assert.equal(isEmailConfigured(GOOD), true);
  assert.equal(isEmailConfigured({}), false);
  assert.equal(isEmailConfigured({ ...GOOD, RESEND_API_KEY: "" }), false);
  assert.equal(isEmailConfigured({ ...GOOD, RESEND_FROM: "" }), false);

  assert.deepEqual(missingEmailSettings({}), ["RESEND_API_KEY", "RESEND_FROM"]);
});

test("sendPasswordResetOtp sends one email with the OTP in its body", async () => {
  const sent = [];

  __setResendForTests({
    emails: {
      send: async (message) => {
        sent.push(message);
        return { data: { id: "test-email-id" }, error: null };
      },
    },
  });

  try {
    const result = await sendPasswordResetOtp(
      {
        to: "verified-account@example.com",
        otp: "482913",
        expiresInMinutes: 5,
      },
      GOOD,
    );

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["verified-account@example.com"]);
    assert.equal(sent[0].from, GOOD.RESEND_FROM);
    assert.ok(sent[0].text.includes("482913"));
    assert.ok(sent[0].html.includes("482913"));
    assert.ok(!sent[0].subject.includes("482913"));
    assert.ok(!JSON.stringify(sent[0]).includes(GOOD.RESEND_API_KEY));
    assert.equal(result.id, "test-email-id");
  } finally {
    __setResendForTests(null);
  }
});

test("sendPasswordResetOtp rejects missing configuration", async () => {
  __setResendForTests({
    emails: {
      send: async () => assert.fail("Email must not be sent"),
    },
  });

  try {
    await assert.rejects(
      () =>
        sendPasswordResetOtp(
          {
            to: "user@example.com",
            otp: "123456",
            expiresInMinutes: 5,
          },
          {},
        ),
      (error) => error.code === "EMAIL_NOT_CONFIGURED",
    );
  } finally {
    __setResendForTests(null);
  }
});

test("sendPasswordResetOtp propagates Resend API errors", async () => {
  __setResendForTests({
    emails: {
      send: async () => ({
        data: null,
        error: {
          name: "validation_error",
          message: "Test delivery failure",
        },
      }),
    },
  });

  try {
    await assert.rejects(
      () =>
        sendPasswordResetOtp(
          {
            to: "user@example.com",
            otp: "123456",
            expiresInMinutes: 5,
          },
          GOOD,
        ),
      (error) => error.code === "validation_error",
    );
  } finally {
    __setResendForTests(null);
  }
});

test("password policy", () => {
  const ok = (pw, email) => validateNewPassword(pw, { email }).ok === true;

  assert.equal(ok("Str0ngPassw0rd"), true);
  assert.equal(ok("abcdefg1"), true);

  for (const pw of [
    "",
    "short1",
    "alllettersonly",
    "12345678",
    "Password123",
    "x".repeat(73) + "1",
    5,
    null,
  ]) {
    assert.equal(ok(pw), false, String(pw));
  }

  assert.equal(ok("driver@example.com", "driver@example.com"), false);
  assert.equal(ok("driver1234", "driver1234@example.com"), false);

  assert.equal(
    validateNewPassword("é".repeat(40) + "1").error !== undefined,
    true,
  );
});
