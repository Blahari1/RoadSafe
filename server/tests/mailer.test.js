// Unit tests for the real mailer module with an injected FAKE transport.
// No SMTP connection is made and nodemailer is not required to run these.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isEmailConfigured,
  missingEmailSettings,
  sendPasswordResetOtp,
  __setTransportForTests,
} = require("../utils/mailer");
const { validateNewPassword } = require("../utils/passwordPolicy");

const GOOD = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_FROM: "RoadSafe <no-reply@example.com>",
  SMTP_USER: "smtp-user-name",
  SMTP_PASS: "s3cret-pass-value",
};

test("isEmailConfigured: requires host, valid port and sender; credentials all-or-nothing", () => {
  assert.equal(isEmailConfigured(GOOD), true);
  assert.equal(isEmailConfigured({ ...GOOD, SMTP_USER: "", SMTP_PASS: "" }), true); // e.g. local relay
  assert.equal(isEmailConfigured({}), false);
  assert.equal(isEmailConfigured({ ...GOOD, SMTP_HOST: "" }), false);
  assert.equal(isEmailConfigured({ ...GOOD, SMTP_FROM: "" }), false);
  assert.equal(isEmailConfigured({ ...GOOD, SMTP_PORT: "abc" }), false);
  assert.equal(isEmailConfigured({ ...GOOD, SMTP_PORT: "70000" }), false);
  assert.equal(isEmailConfigured({ ...GOOD, SMTP_PASS: "" }), false); // user without password
  assert.deepEqual(missingEmailSettings({}).slice(0, 3), ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM"]);
});

test("sendPasswordResetOtp: sends one message to the right address with the code in the body only", async () => {
  const sent = [];
  __setTransportForTests({ sendMail: async (m) => sent.push(m) });

  await sendPasswordResetOtp({ to: "driver@example.com", otp: "482913", expiresInMinutes: 5 }, GOOD);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "driver@example.com");
  assert.equal(sent[0].from, GOOD.SMTP_FROM);
  assert.ok(sent[0].text.includes("482913") && sent[0].html.includes("482913"));
  assert.ok(!sent[0].subject.includes("482913")); // not in the subject line
  assert.ok(!JSON.stringify(sent[0]).includes(GOOD.SMTP_PASS));
  __setTransportForTests(null);
});

test("sendPasswordResetOtp: refuses to run when SMTP is not configured and propagates transport errors", async () => {
  __setTransportForTests({ sendMail: async () => assert.fail("must not send") });
  await assert.rejects(
    () => sendPasswordResetOtp({ to: "a@b.co", otp: "123456", expiresInMinutes: 5 }, {}),
    (error) => error.code === "EMAIL_NOT_CONFIGURED",
  );

  __setTransportForTests({
    sendMail: async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNECTION" });
    },
  });
  await assert.rejects(
    () => sendPasswordResetOtp({ to: "a@b.co", otp: "123456", expiresInMinutes: 5 }, GOOD),
    (error) => error.code === "ECONNECTION",
  );
  __setTransportForTests(null);
});

test("password policy", () => {
  const ok = (pw, email) => validateNewPassword(pw, { email }).ok === true;
  assert.equal(ok("Str0ngPassw0rd"), true);
  assert.equal(ok("abcdefg1"), true); // 8 chars, letter + digit is the minimum bar
  for (const pw of ["", "short1", "alllettersonly", "12345678", "Password123", "x".repeat(73) + "1", 5, null]) {
    assert.equal(ok(pw), false, String(pw));
  }
  assert.equal(ok("driver@example.com", "driver@example.com"), false);
  assert.equal(ok("driver1234", "driver1234@example.com"), false); // local part
  assert.equal(validateNewPassword("é".repeat(40) + "1").error !== undefined, true); // 81 bytes
});
