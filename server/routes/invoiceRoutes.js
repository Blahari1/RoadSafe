const express = require("express");

const {
  createInvoice,
  getInvoiceById,
  getInvoiceByRequest,
  listInvoices,
} = require("../controllers/invoiceController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

// Admin: every invoice.
router.get("/", authorizeRoles("admin"), listInvoices);

// Only the assigned mechanic can issue an invoice (once, after completion).
// There is deliberately no update/delete route: issued amounts are final.
router.post("/request/:requestId", authorizeRoles("mechanic"), createInvoice);

// Read access: owning customer, assigned mechanic, or admin. Ownership is
// re-checked inside the controller.
router.get(
  "/request/:requestId",
  authorizeRoles("customer", "mechanic", "admin"),
  getInvoiceByRequest,
);
router.get(
  "/:id",
  authorizeRoles("customer", "mechanic", "admin"),
  getInvoiceById,
);

module.exports = router;
