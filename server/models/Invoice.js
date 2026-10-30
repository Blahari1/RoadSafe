const mongoose = require("mongoose");

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 100 },
    amount: { type: Number, required: true, min: 0, max: 1000000 },
  },
  { _id: false },
);

// An invoice is issued once, by the assigned mechanic, after completion.
// There is intentionally NO update endpoint: amounts cannot be changed once
// issued. There is also NO payment field: RoadSafe has no payment workflow,
// so it never claims an invoice has been paid.
const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },

    // unique => at most one invoice per service request.
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
      required: true,
      unique: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    mechanicUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    lineItems: {
      type: [lineItemSchema],
      validate: {
        validator: (items) => items.length > 0 && items.length <= 10,
        message: "An invoice needs 1 to 10 charges",
      },
    },

    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    notes: { type: String, trim: true, maxlength: 300, default: "" },

    // Details frozen at issue time so the receipt never changes afterwards.
    snapshot: {
      customerName: String,
      customerPhone: String,
      customerEmail: String,
      mechanicName: String,
      mechanicPhone: String,
      vehicle: String,
      serviceType: String,
      problemDescription: String,
      address: String,
      latitude: Number,
      longitude: Number,
      requestedAt: Date,
      completedAt: Date,
    },

    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Invoice", invoiceSchema);
