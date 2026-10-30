const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");
const Invoice = require("../models/Invoice");
const Counter = require("../models/Counter");
const User = require("../models/User");
const { validateInvoiceInput, parsePagination } = require("../utils/validators");
const { notifyUser } = require("../utils/notify");

// Sequential, unique invoice numbers such as RS-2026-000001.
// The counter increment is atomic. If invoice creation later fails, that
// number is simply skipped (gaps are possible, duplicates are not).
const nextInvoiceNumber = async () => {
  const year = new Date().getFullYear();

  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );

  return `RS-${year}-${String(counter.seq).padStart(6, "0")}`;
};

// Role-based read access. Anything the caller may not see is reported as
// "not found" so invoice IDs cannot be probed.
const canViewInvoice = (invoice, user) => {
  if (user.role === "admin") return true;
  if (user.role === "customer") {
    return invoice.customerId.toString() === user.userId;
  }
  if (user.role === "mechanic") {
    return invoice.mechanicUserId.toString() === user.userId;
  }
  return false;
};

const serializeInvoice = (invoice) => {
  const plain = invoice.toObject ? invoice.toObject() : invoice;

  return {
    ...plain,
    // Explicit and honest: RoadSafe records no payments.
    paymentStatus: "not_recorded",
    paymentNote:
      "RoadSafe does not process or record payments. This invoice is a record of the service charges only.",
  };
};

// POST /api/invoices/request/:requestId       (assigned mechanic only)
// Body: { lineItems: [{ description, amount }], notes? }
// The mechanic enters the charges; the server computes the total.
const createInvoice = async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID",
      });
    }

    const { error, value } = validateInvoiceInput(req.body);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    // Only the mechanic assigned to this request can invoice it.
    const serviceRequest = await ServiceRequest.findOne({
      _id: requestId,
      mechanicId: req.user.userId,
    })
      .populate("customerId", "name email phone")
      .populate("vehicleId");

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        message: "Service request not found or not assigned to you",
      });
    }

    if (serviceRequest.status !== "completed") {
      return res.status(409).json({
        success: false,
        message: "An invoice can only be issued once the service is completed",
      });
    }

    if (await Invoice.exists({ requestId: serviceRequest._id })) {
      return res.status(409).json({
        success: false,
        message: "An invoice has already been issued for this request",
      });
    }

    const mechanicUser = await User.findById(req.user.userId).select(
      "name phone",
    );
    const customer = serviceRequest.customerId;
    const vehicle = serviceRequest.vehicleId;

    let invoice;

    try {
      invoice = await Invoice.create({
        invoiceNumber: await nextInvoiceNumber(),
        requestId: serviceRequest._id,
        customerId: customer._id,
        mechanicUserId: req.user.userId,
        lineItems: value.lineItems,
        totalAmount: value.totalAmount,
        notes: value.notes,
        snapshot: {
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          mechanicName: mechanicUser?.name,
          mechanicPhone: mechanicUser?.phone,
          vehicle: vehicle
            ? `${vehicle.vehicleNumber} - ${vehicle.brand} ${vehicle.model} (${vehicle.vehicleType})`
            : undefined,
          serviceType: serviceRequest.serviceType,
          problemDescription: serviceRequest.problemDescription,
          address: serviceRequest.location?.address,
          latitude: serviceRequest.location?.latitude,
          longitude: serviceRequest.location?.longitude,
          requestedAt: serviceRequest.createdAt,
          completedAt: serviceRequest.completedAt || serviceRequest.updatedAt,
        },
      });
    } catch (createError) {
      // The unique index on requestId stops simultaneous duplicate invoices.
      if (createError.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "An invoice has already been issued for this request",
        });
      }

      if (createError.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: createError.message,
        });
      }

      throw createError;
    }

    notifyUser(req, customer._id, {
      requestId: serviceRequest._id.toString(),
      status: serviceRequest.status,
      message: `Invoice ${invoice.invoiceNumber} is now available.`,
    });

    return res.status(201).json({
      success: true,
      message: "Invoice issued successfully",
      invoice: serializeInvoice(invoice),
    });
  } catch (error) {
    console.error("Create invoice error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to issue the invoice",
    });
  }
};

// GET /api/invoices/:id
const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID",
      });
    }

    const invoice = await Invoice.findById(id);

    if (!invoice || !canViewInvoice(invoice, req.user)) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.status(200).json({
      success: true,
      invoice: serializeInvoice(invoice),
    });
  } catch (error) {
    console.error("Get invoice error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve the invoice",
    });
  }
};

// GET /api/invoices/request/:requestId
const getInvoiceByRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service request ID",
      });
    }

    const invoice = await Invoice.findOne({ requestId });

    if (!invoice || !canViewInvoice(invoice, req.user)) {
      return res.status(404).json({
        success: false,
        message: "No invoice has been issued for this request",
      });
    }

    return res.status(200).json({
      success: true,
      invoice: serializeInvoice(invoice),
    });
  } catch (error) {
    console.error("Get invoice by request error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve the invoice",
    });
  }
};

// GET /api/invoices   (admin only - enforced in the route)
const listInvoices = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [invoices, total] = await Promise.all([
      Invoice.find().sort({ issuedAt: -1 }).skip(skip).limit(limit),
      Invoice.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      invoices: invoices.map(serializeInvoice),
    });
  } catch (error) {
    console.error("List invoices error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve invoices",
    });
  }
};

module.exports = {
  createInvoice,
  getInvoiceById,
  getInvoiceByRequest,
  listInvoices,
};
