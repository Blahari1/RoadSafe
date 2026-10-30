const express = require("express");

const {
  createServiceRequest,
  getMyServiceRequests,
  getServiceRequestById,
  cancelServiceRequest,
  createReview,
} = require("../controllers/serviceRequestController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// These customer booking endpoints require a valid customer account.
router.use(protect);
router.use(authorizeRoles("customer"));

router.post("/", createServiceRequest);
router.get("/", getMyServiceRequests);
router.get("/:id", getServiceRequestById);
router.patch("/:id/cancel", cancelServiceRequest);

// One review per completed request, by the owning customer only.
router.post("/:id/review", createReview);

module.exports = router;
