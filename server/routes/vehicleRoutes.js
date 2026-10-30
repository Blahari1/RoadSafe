const express = require("express");

const {
  getVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
} = require("../controllers/vehicleController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// Vehicles are a customer-only feature: every endpoint requires
// authentication and the customer role.
router.use(protect);
router.use(authorizeRoles("customer"));

router.get("/", getVehicles);
router.post("/", addVehicle);
router.put("/:id", updateVehicle);
router.delete("/:id", deleteVehicle);

module.exports = router;
