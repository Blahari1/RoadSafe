const express = require("express");

const {
  getOverview,
  getMechanics,
  updateMechanicVerification,
  getAllServiceRequests,
  getServiceRequestForAdmin,
  getCustomers,
} = require("../controllers/adminController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// Every admin endpoint requires authentication and the admin role.
router.use(protect);
router.use(authorizeRoles("admin"));

router.get("/overview", getOverview);

router.get("/mechanics", getMechanics);
router.patch("/mechanics/:id/verification", updateMechanicVerification);

// Read-only history of every roadside request across all customers.
router.get("/service-requests", getAllServiceRequests);
router.get("/service-requests/:id", getServiceRequestForAdmin);

router.get("/customers", getCustomers);

module.exports = router;
