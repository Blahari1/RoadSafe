// In-memory stand-ins for the Mongoose models, so controller logic can be
// tested without MongoDB. They implement only the query shapes the
// controllers use. Single-document updates are applied synchronously inside
// findOneAndUpdate, mirroring MongoDB's per-document atomicity.
const Module = require("node:module");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");

const getPath = (doc, key) =>
  key.split(".").reduce((value, part) => (value == null ? undefined : value[part]), doc);

const sameValue = (a, b) => String(a) === String(b);

// Range operators only compare like with like (numbers with numbers, dates with dates).
const comparable = (a, b) =>
  (typeof a === "number" && typeof b === "number") ||
  (a instanceof Date && b instanceof Date);

// Subset of MongoDB query operators used by the controllers.
const matchValue = (actual, expected) => {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const keys = Object.keys(expected);

    if (keys.length && keys.every((k) => k.startsWith("$"))) {
      return keys.every((op) => {
        const arg = expected[op];

        switch (op) {
          case "$in":
            return arg.some((candidate) => sameValue(candidate, actual));
          // Like MongoDB, range operators only match values of the same type
          // (numbers). Strings, null and missing never match; NaN is below
          // every number, so $gte fails for it.
          case "$gte":
            return comparable(actual, arg) && +actual >= +arg;
          case "$lte":
            return comparable(actual, arg) && +actual <= +arg;
          case "$gt":
            return comparable(actual, arg) && +actual > +arg;
          case "$lt":
            return comparable(actual, arg) && +actual < +arg;
          case "$ne":
            return arg === null ? actual != null : !sameValue(actual, arg);
          case "$exists":
            return (actual !== undefined) === arg;
          default:
            throw new Error(`Fake does not support operator ${op}`);
        }
      });
    }
  }

  if (expected === null) return actual == null;

  if (Array.isArray(actual)) return actual.includes(expected);

  return sameValue(actual, expected);
};

const matches = (doc, filter) =>
  Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((clause) => matches(doc, clause));
    if (key === "$nor") return !expected.some((clause) => matches(doc, clause));

    return matchValue(getPath(doc, key), expected);
  });

// A query object that is chainable and awaitable. sort/limit are REAL so that
// tests can expose bugs that depend on "sort, limit, then filter" ordering.
const query = (getResult) => {
  let sortSpec = null;
  let limitN = null;

  const q = {
    populate: () => q,
    select: () => q,
    lean: () => q,
    sort: (spec) => {
      sortSpec = spec;
      return q;
    },
    limit: (n) => {
      limitN = n;
      return q;
    },
    then: (resolve, reject) =>
      Promise.resolve()
        .then(getResult)
        .then((result) => {
          if (!Array.isArray(result)) return result;

          let out = result;

          if (sortSpec) {
            const [[field, dir]] = Object.entries(sortSpec);
            out = [...out].sort((x, y) => {
              const vx = getPath(x, field);
              const vy = getPath(y, field);
              return (vx > vy ? 1 : vx < vy ? -1 : 0) * dir;
            });
          }

          return limitN == null ? out : out.slice(0, limitN);
        })
        .then(resolve, reject),
  };

  return q;
};

let idCounter = 1000;
const newId = () => (++idCounter).toString(16).padStart(24, "0");

// `defaults` mimics Mongoose schema defaults applied on create.
const makeModel = (docs, { unique = [], defaults = {} } = {}) => ({
  docs,
  afterClaim: null, // test hook: runs right after a request is claimed
  find: (filter = {}) =>
    query(async () => docs.filter((d) => matches(d, filter)).map((d) => ({ ...d }))),
  findOne: (filter = {}) =>
    query(async () => {
      const found = docs.find((d) => matches(d, filter));
      return found ? { ...found } : null;
    }),
  findById: (id) =>
    query(async () => {
      const found = docs.find((d) => sameValue(d._id, id));
      return found ? { ...found } : null;
    }),
  countDocuments: async (filter = {}) => docs.filter((d) => matches(d, filter)).length,
  create: async (doc) => {
    for (const field of unique) {
      if (docs.some((d) => d[field] === doc[field])) {
        throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      }
    }
    const created = {
      _id: newId(),
      status: "pending",
      mechanicId: null,
      createdAt: new Date(),
      ...defaults,
      ...doc,
    };
    docs.push(created);
    return { ...created };
  },
  updateOne: async (filter, update) => {
    const found = docs.find((d) => matches(d, filter));
    if (!found) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(found, update.$set || {});
    return { matchedCount: 1, modifiedCount: 1 };
  },
  deleteMany: async (filter = {}) => {
    const keep = docs.filter((d) => !matches(d, filter));
    const deleted = docs.length - keep.length;
    docs.splice(0, docs.length, ...keep);
    return { deletedCount: deleted };
  },
  deleteOne: async (filter = {}) => {
    const index = docs.findIndex((d) => matches(d, filter));
    if (index >= 0) docs.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  },
  // Match + mutate happen in the same tick: only one concurrent caller can win.
  findOneAndUpdate(filter, update) {
    return query(async () => {
      const found = docs.find((d) => matches(d, filter));
      if (!found) return null;
      Object.assign(found, update.$set || {});
      for (const [field, amount] of Object.entries(update.$inc || {})) {
        found[field] = (found[field] || 0) + amount;
      }
      if (update.$set?.status === "accepted" && this.afterClaim) this.afterClaim(found);
      return { ...found };
    });
  },
});

const inject = (relativePath, exports) => {
  const filename = require.resolve(path.join(root, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
};

// Loads a controller with fakes in place. Returns { controller, models, io }.
const loadWithFakes = (
  controllerFile,
  {
    requests = [],
    mechanics = [],
    vehicles = [],
    users = [],
    resets = [],
    rateLimits = [],
    mailer = null,
    notifications = false,
  } = {},
) => {
  // mongoose is not needed for these tests; give modules a minimal stand-in.
  const originalLoad = Module._load;
  class Schema {
    index() {}
  }
  Schema.Types = { ObjectId: function ObjectId() {} };
  const fakeMongoose = {
    Schema,
    Types: { ObjectId: function ObjectId() {} },
    model: (name) => ({ modelName: name }),
    isValidObjectId: (v) => /^[0-9a-fA-F]{24}$/.test(String(v)),
  };
  Module._load = function (request, ...rest) {
    if (request === "mongoose") return fakeMongoose;
    if (request === "bcryptjs") return bcryptStub;
    if (request === "jsonwebtoken") return jwtStub;
    return originalLoad.call(this, request, ...rest);
  };

  const ServiceRequest = makeModel(requests);
  const Mechanic = makeModel(mechanics);
  const emitted = [];
  const io = {
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };

  inject("models/ServiceRequest.js", ServiceRequest);
  inject("models/Mechanic.js", Mechanic);
  const Vehicle = makeModel(vehicles);
  inject("models/Vehicle.js", Vehicle);
  const User = makeModel(users);
  inject("models/User.js", User);
  const PasswordReset = makeModel(resets, {
    defaults: {
      attempts: 0,
      verifiedAt: null,
      usedAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });
  inject("models/PasswordReset.js", PasswordReset);
  const RateLimit = makeModel(rateLimits, { unique: ["key"] });
  inject("models/RateLimit.js", RateLimit);

  const notificationDocs = [];
  const Notification = {
    docs: notificationDocs,
    updateOne: async (filter, update) => {
      const existing = notificationDocs.find(
        (item) =>
          String(item.recipientId) === String(filter.recipientId) &&
          item.dedupeKey === filter.dedupeKey,
      );
      if (existing) return { upsertedCount: 0 };
      notificationDocs.push({
        _id: newId(),
        ...update.$setOnInsert,
        createdAt: new Date(),
      });
      return { upsertedCount: 1 };
    },
    findOne: (filter) =>
      query(async () =>
        notificationDocs.find(
          (item) =>
            String(item.recipientId) === String(filter.recipientId) &&
            item.dedupeKey === filter.dedupeKey,
        ) || null,
      ),
  };
  if (notifications) inject("models/Notification.js", Notification);
  if (mailer) inject("utils/mailer.js", mailer);
  // Keep modules that capture the limiter in sync with the fake just injected.
  delete require.cache[require.resolve(path.join(root, "utils/rateLimit.js"))];
  inject("models/Review.js", makeModel([]));
  inject("utils/requestExtras.js", {
    serializeRequests: async (x) =>
      Array.isArray(x) ? x.map((r) => ({ ...r })) : { ...x },
  });
  inject("utils/ratingSummary.js", {
    getRatingSummaries: async () => new Map(),
    summaryFor: () => ({ average: null, count: 0 }),
  });

  const notifyPath = require.resolve(path.join(root, "utils/notify.js"));
  delete require.cache[notifyPath];
  const controllerPath = require.resolve(path.join(root, controllerFile));
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  Module._load = originalLoad;

  return {
    controller,
    models: { ServiceRequest, Mechanic, Vehicle, User, PasswordReset, RateLimit, Notification },
    emitted,
    io,
  };
};

// Deterministic stand-ins (bcryptjs / jsonwebtoken are not installed where the
// tests are authored). hash/compare keep bcrypt's observable contract: a
// password verifies only against the hash made from the same password.
const bcryptStub = {
  hash: async (password) => `hashed:${password}`,
  compare: async (password, hash) => hash === `hashed:${password}`,
};
const jwtStub = {
  sign: () => "token",
  verify: () => ({}),
};

const mockRes = () => {
  const res = {
    code: 200,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
};

const mockReq = ({
  userId,
  params = {},
  query: q = {},
  body = {},
  io,
  ip = "203.0.113.1",
  headers = {},
} = {}) => ({
  ip,
  headers,
  user: { userId },
  params,
  query: q,
  body,
  app: { get: (k) => (k === "io" ? io : undefined) },
});

// Bengaluru city centre as the reference point; ~0.009 degrees latitude ≈ 1 km.
const BASE = { latitude: 12.9716, longitude: 77.5946 };
const at = (km) => ({ latitude: BASE.latitude + km / 111.19, longitude: BASE.longitude });

let counter = 0;
const oid = () => (++counter).toString(16).padStart(24, "0");

const makeMechanic = (overrides = {}) => ({
  _id: oid(),
  userId: oid(),
  verificationStatus: "approved",
  isAvailable: true,
  services: ["Towing", "Battery Service"],
  location: at(0),
  ...overrides,
});

const makeRequest = (overrides = {}) => ({
  _id: oid(),
  customerId: oid(),
  serviceType: "Towing",
  status: "pending",
  mechanicId: null,
  location: { address: "MG Road", ...at(5) },
  createdAt: new Date(),
  ...overrides,
});

module.exports = {
  loadWithFakes,
  jwtStub,
  bcryptStub,
  mockReq,
  mockRes,
  makeMechanic,
  makeRequest,
  at,
  BASE,
};
