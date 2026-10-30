const express = require("express");
const cors = require("cors");
const vehicleRoutes = require("./routes/vehicleRoutes");
const mechanicRoutes = require("./routes/mechanicRoutes");
const adminRoutes = require("./routes/adminRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
require("dotenv").config();
const serviceRequestRoutes = require("./routes/serviceRequestRoutes");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const { isTokenStale } = require("./utils/sessionCheck");
const app = express();
const PORT = process.env.PORT || 1910;
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
app.set("io", io);
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select(
      "_id role passwordChangedAt",
    );

    if (!user) {
      return next(new Error("User not found"));
    }

    // Tokens issued before a password reset are no longer accepted.
    if (isTokenStale(decoded, user)) {
      return next(new Error("Session expired"));
    }

    socket.user = {
      userId: user._id.toString(),
      role: user.role,
    };

    next();
  } catch (error) {
    next(new Error("Invalid or expired token"));
  }
});


io.on("connection", (socket) => {
  const userRoom = `user:${socket.user.userId}`;

  // Only the authenticated user can join their own room.
  socket.join(userRoom);

  // Mechanics also join a shared room used for "reload your request list"
  // pings. Those pings carry no request data.
  if (socket.user.role === "mechanic") {
    socket.join("mechanics");
  }

  console.log(`Socket connected: ${socket.user.userId} (${socket.user.role})`);

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.user.userId}`);
  });
});

// Behind a reverse proxy / load balancer set TRUST_PROXY (e.g. 1) so that
// req.ip is the real client address; the password-reset rate limits use it.
// Leave unset when the server is exposed directly.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

app.use(cors());
app.use(express.json());


app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RoadSafe API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/mechanics", mechanicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/notifications", notificationRoutes);

// Unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});

// Malformed JSON bodies and other unexpected errors.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid JSON in request body" });
  }

  console.error("Unhandled error:", err.message);
  return res.status(500).json({ success: false, message: "Server error" });
});
const startServer = async () => {
  try {
    if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
      throw new Error("MONGO_URI and JWT_SECRET must be configured");
    }

    await connectDB();

    httpServer.listen(PORT, () => {
      console.log(`RoadSafe server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start RoadSafe:", error.message);
    process.exit(1);
  }
};

startServer();
