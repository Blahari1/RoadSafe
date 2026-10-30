const SERVICE_TYPES = [
  "General Repair",
  "Engine Repair",
  "Battery Service",
  "Tyre/Puncture Repair",
  "Towing",
  "Electrical Repair",
  "Oil Change",
  "Brake Repair",
];

const REQUEST_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
];

// A customer can only have one request in these states per vehicle.
const ACTIVE_STATUSES = ["pending", "accepted", "in_progress"];

const VERIFICATION_STATUSES = ["pending", "approved", "rejected"];

module.exports = {
  SERVICE_TYPES,
  REQUEST_STATUSES,
  ACTIVE_STATUSES,
  VERIFICATION_STATUSES,
};
