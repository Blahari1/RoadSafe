const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isTokenStale } = require("../utils/sessionCheck");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("_id role passwordChangedAt");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found",
      });
    }

    // A password reset invalidates every token issued before it.
    if (isTokenStale(decoded, user)) {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
      });
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = { protect };
