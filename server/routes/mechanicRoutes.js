const express = require("express");

const {
  registerMechanic,
  getMyMechanicProfile,
  updateMyMechanicProfile,
  updateMyAvailability,
  getMyReviews,
} = require("../controllers/mechanicController");
const {
  getMechanicRequests,
  acceptServiceRequest,
  updateServiceRequestStatus,
} = require("../controllers/mechanicRequestController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();
const {
  getNearbyMechanics,
} = require("../controllers/nearbyMechanicController");
// Public registration endpoint.
// The controller assigns the mechanic role securely.
router.post("/register", registerMechanic);

// All routes below require an authenticated mechanic.
router.use(protect);
router.get("/nearby", protect, authorizeRoles("customer"), getNearbyMechanics);
router.use(authorizeRoles("mechanic"));
router.get("/requests", getMechanicRequests);

router.patch("/requests/:id/accept", acceptServiceRequest);

router.patch("/requests/:id/status", updateServiceRequestStatus);
router.get("/me", getMyMechanicProfile);
router.get("/me/reviews", getMyReviews);
router.put("/me", updateMyMechanicProfile);
router.patch("/me/availability", updateMyAvailability);

module.exports = router;
