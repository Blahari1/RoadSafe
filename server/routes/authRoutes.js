const express = require("express");
const { register, login, getMe } = require("../controllers/authController");
const {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} = require("../controllers/passwordResetController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);

// Public password-recovery flow (no login required; rate limited in the controller).
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

module.exports = router;
