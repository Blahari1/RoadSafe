// MOCKED tests: in-memory fake models, a fake mailer and stand-ins for bcryptjs /
// jsonwebtoken (see helpers/fakes.js). No real email is ever sent and no
// database is used, so these verify our logic and the atomic-update CONTRACT,
// not real MongoDB, real bcrypt or real SMTP behaviour.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadWithFakes, jwtStub, mockReq, mockRes } = require("./helpers/fakes");
const { hashOtp, hashToken, generateOtp } = require("../utils/otp");

process.env.JWT_SECRET = "test-secret-not-real";
delete process.env.OTP_HMAC_SECRET;

let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

const makeUser = (overrides = {}) => ({
  _id: `${++ipCounter}`.padStart(24, "a"),
  name: "Test User",
  email: "driver@example.com",
  phone: "9999999999",
  password: "hashed:OldPassw0rd",
  role: "customer",
  passwordChangedAt: null,
  ...overrides,
});

const setup = ({ users = [makeUser()], mechanics = [] } = {}) => {
  const sent = [];
  const cfg = { configured: true, fail: false };
  const io = { disconnects: [] };
  io.in = (room) => ({ disconnectSockets: (close) => io.disconnects.push({ room, close }) });
  io.to = () => ({ emit: () => {} });

  const mailer = {
    isEmailConfigured: () => cfg.configured,
    missingEmailSettings: () => (cfg.configured ? [] : ["SMTP_HOST", "SMTP_FROM"]),
    sendPasswordResetOtp: async (args) => {
      sent.push(args);
      if (cfg.fail) {
        throw Object.assign(new Error("smtp rejected login: password=hunter2"), {
          code: "EAUTH",
        });
      }
    },
  };

  const ctx = loadWithFakes("controllers/passwordResetController.js", { users, mechanics, mailer });
  const auth = loadWithFakes("controllers/authController.js", { users, mechanics, mailer });
  // The reset controller must use ITS fakes; reload it last so the shared arrays are the same.
  const reset = loadWithFakes("controllers/passwordResetController.js", { users, mechanics, mailer });

  return { users, sent, cfg, io, c: reset.controller, models: reset.models, auth: auth.controller, ctx };
};

const call = async (fn, body, extra = {}) => {
  const res = mockRes();
  await fn(mockReq({ body, ip: freshIp(), ...extra }), res);
  return res;
};

const requestCode = async (t, email = "driver@example.com", extra = {}) => {
  const res = await call(t.c.forgotPassword, { email }, { io: t.io, ...extra });
  await t.c.__settleEmails();
  return res;
};

// Opens the per-email cooldown so a test can request another code immediately.
const clearCooldown = (t) => {
  t.models.RateLimit.docs.forEach((d) => {
    d.lastHitAt = new Date(Date.now() - 3600 * 1000);
  });
};

const lastOtp = (t) => t.sent[t.sent.length - 1]?.otp;

const verify = (t, otp, email = "driver@example.com", extra = {}) =>
  call(t.c.verifyResetOtp, { email, otp }, extra);

const getResetToken = async (t, email = "driver@example.com") => {
  await requestCode(t, email);
  const res = await verify(t, lastOtp(t), email);
  assert.equal(res.code, 200);
  return res.body.resetToken;
};

const reset = (t, resetToken, newPassword = "NewPassw0rd9", confirmPassword = newPassword, extra = {}) =>
  call(t.c.resetPassword, { resetToken, newPassword, confirmPassword }, { io: t.io, ...extra });

const login = (t, email, password) => call(t.auth.login, { email, password });

// Capture console output so tests can assert nothing sensitive is logged.
const captureConsole = async (fn) => {
  const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const lines = [];
  for (const k of Object.keys(originals)) console[k] = (...a) => lines.push(a.join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, originals);
  }
};

// ---------------------------------------------------------------- step 1

test("forgot: registered and unregistered emails get IDENTICAL responses (no enumeration)", async () => {
  const t = setup();
  const known = await requestCode(t, "driver@example.com");
  const unknown = await requestCode(t, "nobody@example.com");

  assert.equal(known.code, 200);
  assert.equal(unknown.code, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(t.sent.length, 1); // mail only for the real account
  assert.equal(t.sent[0].to, "driver@example.com");
  assert.equal(t.models.PasswordReset.docs.length, 1);
});

test("forgot: email is matched case-insensitively and trimmed", async () => {
  const t = setup();
  await requestCode(t, "  DRIVER@Example.COM ");
  assert.equal(t.sent.length, 1);
});

test("forgot: invalid email formats are rejected with 400 and nothing is sent", async () => {
  const t = setup();
  for (const email of [undefined, null, 5, {}, [], "", "   ", "plain", "a@b", "a b@c.com", "x".repeat(250) + "@a.com"]) {
    const res = await call(t.c.forgotPassword, { email });
    assert.equal(res.code, 400, JSON.stringify(email));
  }
  assert.equal(call(t.c.forgotPassword, undefined) instanceof Promise, true);
  assert.equal(t.sent.length, 0);
});

test("forgot: OTP is 6 digits, only its HMAC is stored, and it never appears in the response", async () => {
  const t = setup();
  const user = t.users[0];
  const res = await requestCode(t);
  const otp = lastOtp(t);

  assert.match(otp, /^\d{6}$/);

  const record = t.models.PasswordReset.docs[0];
  assert.notEqual(record.otpHash, otp);
  assert.match(record.otpHash, /^[a-f0-9]{64}$/);
  assert.equal(record.otpHash, hashOtp(otp, user._id));
  assert.ok(!JSON.stringify(record).includes(otp), "plaintext OTP stored");
  assert.ok(!JSON.stringify(res.body).includes(otp), "OTP in response body");
  assert.ok(!JSON.stringify(res.headers).includes(otp), "OTP in response headers");
  assert.equal(String(record.userId), String(user._id));
});

test("forgot: OTP expires after 5 minutes (record + response agree)", async () => {
  const t = setup();
  const before = Date.now();
  const res = await requestCode(t);
  const record = t.models.PasswordReset.docs[0];
  const ttl = record.expiresAt.getTime() - before;

  assert.ok(ttl > 299000 && ttl <= 301000, `ttl ${ttl}`);
  assert.equal(res.body.expiresInSeconds, 300);
  assert.equal(record.attempts, 0);
  assert.equal(record.verifiedAt, null);
  assert.equal(record.usedAt, null);
  assert.ok(record.purgeAt > record.expiresAt); // TTL cleanup happens after expiry
  assert.equal(t.sent[0].expiresInMinutes, 5);
});

test("forgot: a new request replaces the previous code (only the newest works)", async () => {
  const t = setup();
  await requestCode(t);
  const first = lastOtp(t);
  clearCooldown(t);
  await requestCode(t);
  const second = lastOtp(t);

  assert.equal(t.models.PasswordReset.docs.length, 1);
  assert.equal((await verify(t, first)).code, first === second ? 200 : 400);
  if (first !== second) assert.equal((await verify(t, second)).code, 200);
});

test("forgot: email delivery NOT configured -> 503 with guidance, nothing created or sent, same for unknown emails", async () => {
  const t = setup();
  t.cfg.configured = false;
  const { result: results, lines } = await captureConsole(async () => [
    await call(t.c.forgotPassword, { email: "driver@example.com" }),
    await call(t.c.forgotPassword, { email: "nobody@example.com" }),
  ]);

  for (const res of results) {
    assert.equal(res.code, 503);
    assert.equal(res.body.code, "EMAIL_NOT_CONFIGURED");
    assert.match(res.body.message, /not configured/i);
  }
  assert.deepEqual(results[0].body, results[1].body);
  assert.equal(t.sent.length, 0);
  assert.equal(t.models.PasswordReset.docs.length, 0);
  assert.ok(lines.some((l) => l.includes("SMTP_HOST"))); // names the setting, not values
});

test("forgot: email delivery FAILURE -> generic success (no enumeration), record removed, no secrets or OTP logged", async () => {
  const t = setup();
  t.cfg.fail = true;

  const { result: res, lines } = await captureConsole(async () => {
    const r = await call(t.c.forgotPassword, { email: "driver@example.com" }, { io: t.io });
    await t.c.__settleEmails();
    return r;
  });

  assert.equal(res.code, 200);
  assert.equal(t.sent.length, 1); // delivery was attempted
  assert.equal(t.models.PasswordReset.docs.length, 0); // unusable code deleted
  const logged = lines.join("\n");
  assert.ok(logged.includes("EAUTH"));
  assert.ok(!logged.includes("hunter2"), "SMTP error text leaked into logs");
  assert.ok(!logged.includes(t.sent[0].otp), "OTP logged");
  assert.ok(!logged.includes("driver@example.com"), "address logged");

  // The response is exactly what an unknown address would receive.
  const unknown = await call(t.c.forgotPassword, { email: "nobody@example.com" });
  assert.deepEqual(res.body, unknown.body);
});

test("nothing sensitive is logged during a normal flow", async () => {
  const t = setup();
  const { result: otpAndToken, lines } = await captureConsole(async () => {
    const token = await getResetToken(t);
    await reset(t, token);
    return { otp: lastOtp(t), token };
  });
  const logged = lines.join("\n");
  assert.ok(!logged.includes(otpAndToken.otp));
  assert.ok(!logged.includes(otpAndToken.token));
  assert.ok(!logged.includes("NewPassw0rd9"));
});

// ---------------------------------------------------------------- step 2

test("verify: correct OTP returns a one-time reset token that is stored only as a hash", async () => {
  const t = setup();
  await requestCode(t);
  const res = await verify(t, lastOtp(t));

  assert.equal(res.code, 200);
  assert.match(res.body.resetToken, /^[a-f0-9]{64}$/);
  assert.equal(res.body.expiresInSeconds, 600);

  const record = t.models.PasswordReset.docs[0];
  assert.ok(record.verifiedAt instanceof Date);
  assert.equal(record.resetTokenHash, hashToken(res.body.resetToken));
  assert.notEqual(record.resetTokenHash, res.body.resetToken);
  assert.ok(!JSON.stringify(res.body).includes(record.otpHash));
});

test("verify: wrong OTP -> generic 400, attempt counted, no token", async () => {
  const t = setup();
  await requestCode(t);
  const wrong = lastOtp(t) === "000000" ? "111111" : "000000";
  const res = await verify(t, wrong);

  assert.equal(res.code, 400);
  assert.equal(res.body.resetToken, undefined);
  assert.equal(t.models.PasswordReset.docs[0].attempts, 1);
});

test("verify: malformed OTP and email are rejected before touching the database", async () => {
  const t = setup();
  await requestCode(t);
  for (const otp of [undefined, 123456, "12345", "1234567", "12345a", " 12345", "١٢٣٤٥٦", null]) {
    assert.equal((await verify(t, otp)).code, 400, String(otp));
  }
  assert.equal((await call(t.c.verifyResetOtp, { email: "bad", otp: "123456" })).code, 400);
  assert.equal(t.models.PasswordReset.docs[0].attempts, 0);
});

test("verify: EXPIRED OTP is rejected", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  t.models.PasswordReset.docs[0].expiresAt = new Date(Date.now() - 1000);
  const res = await verify(t, otp);
  assert.equal(res.code, 400);
  assert.equal(res.body.resetToken, undefined);
});

test("verify: unknown email and every failure kind give the SAME response", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  const wrong = otp === "000000" ? "111111" : "000000";

  const unknownEmail = await verify(t, wrong, "nobody@example.com");
  const wrongCode = await verify(t, wrong);
  t.models.PasswordReset.docs[0].expiresAt = new Date(Date.now() - 1000);
  const expired = await verify(t, otp);

  assert.deepEqual([unknownEmail.code, wrongCode.code, expired.code], [400, 400, 400]);
  assert.deepEqual(unknownEmail.body, wrongCode.body);
  assert.deepEqual(wrongCode.body, expired.body);
});

test("verify: after 5 wrong attempts even the CORRECT code is rejected", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  const wrong = otp === "000000" ? "111111" : "000000";

  for (let i = 0; i < 5; i += 1) assert.equal((await verify(t, wrong)).code, 400);
  assert.equal(t.models.PasswordReset.docs[0].attempts, 5);

  const res = await verify(t, otp);
  assert.equal(res.code, 400);
  assert.equal(res.body.resetToken, undefined);
  assert.equal(t.models.PasswordReset.docs[0].attempts, 5); // no further counting
  assert.equal(t.models.PasswordReset.docs[0].verifiedAt, null);
});

test("verify: the 5th attempt can still succeed (limit is exactly 5)", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  const wrong = otp === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i += 1) await verify(t, wrong);
  assert.equal((await verify(t, otp)).code, 200);
});

test("verify: parallel guesses cannot exceed the attempt limit", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  const wrong = otp === "000000" ? "111111" : "000000";

  const results = await Promise.all(Array.from({ length: 12 }, () => verify(t, wrong)));
  assert.ok(results.every((r) => r.code === 400));
  assert.equal(t.models.PasswordReset.docs[0].attempts, 5); // never 6..12
  assert.equal((await verify(t, otp)).code, 400);
});

test("verify: an OTP cannot be reused after successful verification (replay)", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  assert.equal((await verify(t, otp)).code, 200);
  const replay = await verify(t, otp);
  assert.equal(replay.code, 400);
  assert.equal(replay.body.resetToken, undefined);
});

test("verify: two simultaneous correct submissions yield exactly one token", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  const results = await Promise.all([verify(t, otp), verify(t, otp), verify(t, otp)]);
  assert.equal(results.filter((r) => r.code === 200).length, 1);
});

// ---------------------------------------------------------------- rate limits

test("rate limit: second code request inside the 60s cooldown -> 429 with Retry-After", async () => {
  const t = setup();
  assert.equal((await requestCode(t)).code, 200);
  const res = await requestCode(t);
  assert.equal(res.code, 429);
  assert.ok(res.body.retryAfterSeconds >= 1 && res.body.retryAfterSeconds <= 60);
  assert.equal(res.headers["Retry-After"], String(res.body.retryAfterSeconds));
  assert.equal(t.sent.length, 1);
});

test("rate limit: at most 5 codes per email per hour (also for UNKNOWN emails, so nothing leaks)", async () => {
  for (const email of ["driver@example.com", "nobody@example.com"]) {
    const t = setup();
    const codes = [];
    for (let i = 0; i < 7; i += 1) {
      clearCooldown(t);
      codes.push((await requestCode(t, email)).code);
    }
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429], email);
  }
});

test("rate limit: per-IP cap on code requests across different emails", async () => {
  const t = setup();
  const ip = "192.0.2.77";
  const codes = [];
  for (let i = 0; i < 12; i += 1) {
    const res = await call(t.c.forgotPassword, { email: `user${i}@example.com` }, { ip });
    codes.push(res.code);
  }
  assert.deepEqual(codes, [...Array(10).fill(200), 429, 429]);
});

test("rate limit: verification attempts are limited per email across many IPs", async () => {
  const t = setup();
  await requestCode(t);
  const codes = [];
  for (let i = 0; i < 17; i += 1) codes.push((await verify(t, "000000")).code);
  assert.equal(codes.filter((c) => c === 429).length, 2); // 15 allowed, then blocked
  assert.equal(codes.slice(0, 15).every((c) => c === 400), true);
});

test("rate limit: per-IP cap on verification attempts and on reset attempts", async () => {
  const t = setup();
  const ip = "192.0.2.88";
  const v = [];
  for (let i = 0; i < 32; i += 1) {
    v.push((await call(t.c.verifyResetOtp, { email: `u${i}@example.com`, otp: "000000" }, { ip })).code);
  }
  assert.equal(v.filter((c) => c === 429).length, 2);

  const r = [];
  for (let i = 0; i < 22; i += 1) {
    r.push((await reset(t, "a".repeat(64), "NewPassw0rd9", "NewPassw0rd9", { ip: "192.0.2.99" })).code);
  }
  assert.equal(r.filter((c) => c === 429).length, 2);
});

test("rate limiter: parallel requests cannot exceed the limit, and the window resets", async () => {
  const t = setup();
  const { consume } = require("../utils/rateLimit");
  const opts = { limit: 3, windowMs: 1000 };

  const results = await Promise.all(Array.from({ length: 10 }, () => consume("k", opts)));
  assert.equal(results.filter((r) => r.allowed).length, 3);
  assert.equal(t.models.RateLimit.docs.length, 1); // unique key held

  t.models.RateLimit.docs[0].expiresAt = new Date(Date.now() - 1);
  assert.equal((await consume("k", opts)).allowed, true); // new window
  assert.equal(t.models.RateLimit.docs[0].count, 1);

  const spaced = { limit: 5, windowMs: 60000, minIntervalMs: 60000 };
  assert.equal((await consume("s", spaced)).allowed, true);
  assert.equal((await consume("s", spaced)).allowed, false);
});

test("rate-limit keys never contain the raw email address", async () => {
  const t = setup();
  await requestCode(t);
  assert.ok(t.models.RateLimit.docs.every((d) => !d.key.includes("driver@example.com")));
});

// ---------------------------------------------------------------- step 3

test("reset: cannot be done with only an email (no OTP verification)", async () => {
  const t = setup();
  await requestCode(t);
  const attempts = [
    { email: "driver@example.com", newPassword: "NewPassw0rd9", confirmPassword: "NewPassw0rd9" },
    { resetToken: "a".repeat(64), newPassword: "NewPassw0rd9", confirmPassword: "NewPassw0rd9" },
    { resetToken: hashOtp("123456", t.users[0]._id), newPassword: "NewPassw0rd9", confirmPassword: "NewPassw0rd9" },
    { resetToken: lastOtp(t), newPassword: "NewPassw0rd9", confirmPassword: "NewPassw0rd9" },
  ];
  for (const body of attempts) {
    assert.equal((await call(t.c.resetPassword, body)).code, 400, JSON.stringify(Object.keys(body)));
  }
  assert.equal(t.users[0].password, "hashed:OldPassw0rd");
});

test("reset: an unverified (OTP not yet entered) record cannot be redeemed", async () => {
  const t = setup();
  await requestCode(t);
  const record = t.models.PasswordReset.docs[0];
  record.resetTokenHash = hashToken("b".repeat(64)); // token exists but verifiedAt is still null
  record.resetTokenExpiresAt = new Date(Date.now() + 600000); // ...and is unexpired, so ONLY verifiedAt blocks it
  assert.equal((await reset(t, "b".repeat(64))).code, 400);
  assert.equal(t.users[0].password, "hashed:OldPassw0rd");
});

test("reset: password mismatch is rejected and the token is NOT consumed", async () => {
  const t = setup();
  const token = await getResetToken(t);
  const res = await reset(t, token, "NewPassw0rd9", "NewPassw0rd8");
  assert.equal(res.code, 400);
  assert.match(res.body.message, /do not match/i);
  assert.equal(t.users[0].password, "hashed:OldPassw0rd");
  assert.equal((await reset(t, token, "NewPassw0rd9")).code, 200); // same token still works
});

test("reset: weak passwords are rejected server-side and the token survives", async () => {
  const t = setup();
  const token = await getResetToken(t);
  const weak = [
    "short1", "onlyletters", "12345678", "password123", "RoadSafe123",
    "driver@example.com", "a1" + "x".repeat(80), 12345678, null, undefined,
  ];
  for (const pw of weak) {
    const res = await call(t.c.resetPassword, { resetToken: token, newPassword: pw, confirmPassword: pw });
    assert.equal(res.code, 400, String(pw));
  }
  assert.equal(t.users[0].password, "hashed:OldPassw0rd");
  assert.equal((await reset(t, token, "Str0ngPassw0rd")).code, 200);
});

test("reset: success changes the password; old password stops working, new one works", async () => {
  const t = setup();
  assert.equal((await login(t, "driver@example.com", "OldPassw0rd")).code, 200);

  const token = await getResetToken(t);
  const res = await reset(t, token, "NewPassw0rd9");
  assert.equal(res.code, 200);

  assert.equal(t.users[0].password, "hashed:NewPassw0rd9"); // hashed, not plaintext
  assert.ok(t.users[0].passwordChangedAt instanceof Date);
  assert.equal((await login(t, "driver@example.com", "OldPassw0rd")).code, 401);
  assert.equal((await login(t, "driver@example.com", "NewPassw0rd9")).code, 200);
  assert.equal(t.models.PasswordReset.docs.length, 0); // all reset records removed
  assert.ok(!JSON.stringify(res.body).includes("hashed"));
});

test("reset: live socket connections of the user are closed", async () => {
  const t = setup();
  const token = await getResetToken(t);
  await reset(t, token);
  assert.deepEqual(t.io.disconnects, [{ room: `user:${t.users[0]._id}`, close: true }]);
});

test("reset: token and OTP cannot be reused after a successful reset", async () => {
  const t = setup();
  await requestCode(t);
  const otp = lastOtp(t);
  const token = (await verify(t, otp)).body.resetToken;
  assert.equal((await reset(t, token, "NewPassw0rd9")).code, 200);

  assert.equal((await reset(t, token, "Another1Passw0rd")).code, 400);
  assert.equal((await verify(t, otp)).code, 400);
  assert.equal(t.users[0].password, "hashed:NewPassw0rd9");
});

test("reset: expired reset token is rejected", async () => {
  const t = setup();
  const token = await getResetToken(t);
  t.models.PasswordReset.docs[0].resetTokenExpiresAt = new Date(Date.now() - 1000);
  assert.equal((await reset(t, token)).code, 400);
  assert.equal(t.users[0].password, "hashed:OldPassw0rd");
});

test("reset: simultaneous attempts with the same token -> exactly one succeeds", async () => {
  const t = setup();
  const token = await getResetToken(t);
  const passwords = ["FirstPassw0rd1", "SecondPassw0rd2", "ThirdPassw0rd3", "FourthPassw0rd4", "FifthPassw0rd5"];
  const results = await Promise.all(passwords.map((pw) => reset(t, token, pw)));

  const winners = results.map((r, i) => (r.code === 200 ? i : -1)).filter((i) => i >= 0);
  assert.equal(winners.length, 1);
  assert.equal(results.filter((r) => r.code === 400).length, 4);
  assert.equal(t.users[0].password, `hashed:${passwords[winners[0]]}`);
});

test("reset: if saving the password fails the token is given back for a retry", async () => {
  const t = setup();
  const token = await getResetToken(t);
  const real = t.models.User.updateOne;
  let failed = false;
  t.models.User.updateOne = async (...args) => {
    if (!failed) {
      failed = true;
      throw new Error("db down");
    }
    return real(...args);
  };

  const { result: first } = await captureConsole(() => reset(t, token));
  assert.equal(first.code, 500);
  assert.equal(t.users[0].password, "hashed:OldPassw0rd");
  assert.equal((await reset(t, token)).code, 200);
});

test("reset: only password and passwordChangedAt change; role and other fields cannot be altered", async () => {
  const mechanicUser = makeUser({ role: "mechanic", email: "mech@example.com", name: "Mo Mechanic" });
  const mechanicProfile = { _id: "m1", userId: mechanicUser._id, verificationStatus: "approved", isAvailable: true, services: ["Towing"] };
  const t = setup({ users: [makeUser(), mechanicUser], mechanics: [mechanicProfile] });
  const snapshotUser = { ...mechanicUser };
  const snapshotProfile = JSON.stringify(mechanicProfile);

  const updates = [];
  const realUpdate = t.models.User.updateOne;
  t.models.User.updateOne = (filter, update) => {
    updates.push(update);
    return realUpdate(filter, update);
  };

  const token = await getResetToken(t, "mech@example.com");
  const res = await call(t.c.resetPassword, {
    resetToken: token,
    newPassword: "NewPassw0rd9",
    confirmPassword: "NewPassw0rd9",
    // Attacker-supplied extras must be ignored.
    role: "admin", email: "attacker@example.com", name: "Hacked", isAdmin: true, verificationStatus: "rejected",
  });

  assert.equal(res.code, 200);
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0]), ["$set"]);
  assert.deepEqual(Object.keys(updates[0].$set).sort(), ["password", "passwordChangedAt"]);

  const after = t.users[1];
  assert.equal(after.role, "mechanic");
  assert.equal(after.email, snapshotUser.email);
  assert.equal(after.name, snapshotUser.name);
  assert.equal(after.phone, snapshotUser.phone);
  assert.equal(JSON.stringify(mechanicProfile), snapshotProfile); // verification status untouched
  assert.equal(t.users[0].password, "hashed:OldPassw0rd"); // the other account untouched
});

test("works for customer, mechanic and admin accounts; one user's code cannot reset another", async () => {
  const customer = makeUser({ email: "c@example.com" });
  const mechanic = makeUser({ email: "m@example.com", role: "mechanic" });
  const admin = makeUser({ email: "a@example.com", role: "admin" });
  const t = setup({ users: [customer, mechanic, admin] });

  for (const [u, pw] of [[customer, "CustPassw0rd1"], [mechanic, "MechPassw0rd2"], [admin, "AdminPassw0rd3"]]) {
    const token = await getResetToken(t, u.email);
    assert.equal((await reset(t, token, pw)).code, 200, u.role);
    assert.equal(u.password, `hashed:${pw}`);
    assert.equal((await login(t, u.email, pw)).code, 200);
  }

  // A code requested for the customer is worthless against the mechanic's email.
  await requestCode(t, "c@example.com");
  const customerOtp = lastOtp(t);
  assert.equal((await verify(t, customerOtp, "m@example.com")).code, 400);
});

// ---------------------------------------------------------------- sessions

test("sessions: tokens issued before a password reset are rejected, newer ones accepted", async () => {
  const changedAt = new Date("2026-01-01T12:00:10Z");
  const user = makeUser({ passwordChangedAt: changedAt });
  const { controller } = loadWithFakes("middleware/authMiddleware.js", { users: [user] });
  const changedSec = Math.floor(changedAt.getTime() / 1000);

  const run = async (iat) => {
    jwtStub.verify = () => ({ userId: user._id, iat });
    const res = mockRes();
    let nextCalled = false;
    const req = { headers: { authorization: "Bearer abc" } };
    await controller.protect(req, res, () => {
      nextCalled = true;
    });
    return { res, nextCalled, req };
  };

  try {
    const stale = await run(changedSec - 5);
    assert.equal(stale.res.code, 401);
    assert.equal(stale.nextCalled, false);

    const noIat = await run(undefined);
    assert.equal(noIat.res.code, 401);

    const fresh = await run(changedSec + 1);
    assert.equal(fresh.nextCalled, true);
    assert.equal(fresh.req.user.role, "customer");

    const sameSecond = await run(changedSec);
    assert.equal(sameSecond.nextCalled, true);
  } finally {
    jwtStub.verify = () => ({});
  }
});

test("sessions: accounts that never reset a password are unaffected", async () => {
  const user = makeUser({ passwordChangedAt: null });
  const { controller } = loadWithFakes("middleware/authMiddleware.js", { users: [user] });
  jwtStub.verify = () => ({ userId: user._id, iat: 1 });
  const res = mockRes();
  let ok = false;
  await controller.protect({ headers: { authorization: "Bearer abc" } }, res, () => {
    ok = true;
  });
  jwtStub.verify = () => ({});
  assert.equal(ok, true);
});

// ---------------------------------------------------------------- pure checks

test("OTP generation: always 6 digits, varied, and sourced from crypto (never Math.random)", () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i += 1) {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/);
    seen.add(otp);
  }
  assert.ok(seen.size > 4500, `only ${seen.size} distinct codes`);

  const source = fs
    .readFileSync(path.join(__dirname, "../utils/otp.js"), "utf8")
    .replace(/\/\/.*$/gm, ""); // ignore comments
  assert.ok(!source.includes("Math.random"));
  assert.ok(source.includes("crypto.randomInt") && source.includes("randomBytes"));
});

test("OTP hash: deterministic, keyed by user and secret, compared in constant time", () => {
  const a = hashOtp("123456", "user1");
  assert.equal(a, hashOtp("123456", "user1"));
  assert.notEqual(a, hashOtp("123456", "user2"));
  assert.notEqual(a, hashOtp("123457", "user1"));
  assert.notEqual(a, hashOtp("123456", "user1", { JWT_SECRET: "another-secret" }));
  assert.throws(() => hashOtp("123456", "user1", {}));
  const source = fs.readFileSync(path.join(__dirname, "../utils/otp.js"), "utf8");
  assert.ok(source.includes("timingSafeEqual"));
});
