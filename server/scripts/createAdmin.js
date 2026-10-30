// One-time command-line script to create an admin account.
//
// Admin accounts can NOT be created through the website or the public API.
// Run this on a machine that has access to your server/.env file:
//
//   ADMIN_NAME="Site Admin" ADMIN_EMAIL="admin@example.com" \
//   ADMIN_PHONE="9999999999" ADMIN_PASSWORD="a-long-unique-password" \
//   npm run create-admin
//
// The script refuses to touch an email that already exists.
require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");

const MIN_PASSWORD_LENGTH = 12;

const run = async () => {
  const { MONGO_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD } =
    process.env;

  if (!MONGO_URI) {
    throw new Error("MONGO_URI must be set in server/.env");
  }

  if (!ADMIN_NAME?.trim() || !ADMIN_EMAIL?.trim() || !ADMIN_PHONE?.trim()) {
    throw new Error("ADMIN_NAME, ADMIN_EMAIL and ADMIN_PHONE are required");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL.trim())) {
    throw new Error("ADMIN_EMAIL is not a valid email address");
  }

  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD is required and must have at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  await mongoose.connect(MONGO_URI);

  const email = ADMIN_EMAIL.trim().toLowerCase();

  if (await User.exists({ email })) {
    throw new Error(
      `An account with ${email} already exists. Use a different email.`,
    );
  }

  await User.create({
    name: ADMIN_NAME.trim(),
    email,
    phone: ADMIN_PHONE.trim(),
    password: await bcrypt.hash(ADMIN_PASSWORD, 10),
    role: "admin",
  });

  console.log(`Admin account created for ${email}`);
};

run()
  .catch((error) => {
    console.error("Could not create admin:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
