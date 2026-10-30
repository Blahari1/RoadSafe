// Strict ObjectId format check (24 hex characters), usable without mongoose.
const isObjectIdString = (value) =>
  typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);

module.exports = { isObjectIdString };
