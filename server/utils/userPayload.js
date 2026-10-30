const Mechanic = require("../models/Mechanic");

// The user object returned by login / register / me.
// Mechanics also get their verification status so the client can send them
// to the right page without a second request.
const buildUserPayload = async (user) => {
  const payload = {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  if (user.role === "mechanic") {
    const profile = await Mechanic.findOne({ userId: user._id }).select(
      "verificationStatus",
    );

    payload.verificationStatus = profile?.verificationStatus || "pending";
  }

  return payload;
};

module.exports = { buildUserPayload };
