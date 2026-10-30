const RateLimit = require("../models/RateLimit");

// Database-backed fixed-window limiter, so limits survive restarts and are
// shared between server instances. Every step is a single atomic operation:
//   1. increment an existing live window if it is under the limit and the
//      minimum interval since the last hit has passed;
//   2. otherwise, if a live window exists, the caller is blocked;
//   3. otherwise recycle an expired window, or create one (the unique index on
//      `key` makes a lost creation race fall back to step 1).
// If the database misbehaves repeatedly the limiter FAILS CLOSED.
const consume = async (key, { limit, windowMs, minIntervalMs = 0 }) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();

    const updated = await RateLimit.findOneAndUpdate(
      {
        key,
        expiresAt: { $gt: now },
        count: { $lt: limit },
        lastHitAt: { $lte: new Date(now.getTime() - minIntervalMs) },
      },
      { $inc: { count: 1 }, $set: { lastHitAt: now } },
      { new: true },
    );

    if (updated) return { allowed: true };

    const live = await RateLimit.findOne({ key, expiresAt: { $gt: now } });

    if (live) {
      const untilWindowEnds = live.expiresAt.getTime() - now.getTime();
      const untilIntervalEnds = live.lastHitAt.getTime() + minIntervalMs - now.getTime();
      const wait = live.count >= limit ? untilWindowEnds : untilIntervalEnds;

      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) };
    }

    const fresh = {
      count: 1,
      windowStart: now,
      lastHitAt: now,
      expiresAt: new Date(now.getTime() + windowMs),
    };

    const recycled = await RateLimit.findOneAndUpdate(
      { key, expiresAt: { $lte: now } },
      { $set: fresh },
      { new: true },
    );

    if (recycled) return { allowed: true };

    try {
      await RateLimit.create({ key, ...fresh });
      return { allowed: true };
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Someone else created the window first: loop and count against it.
    }
  }

  return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
};

module.exports = { consume };
