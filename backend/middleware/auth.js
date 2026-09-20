
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// =====================================================
// VERIFY JWT AND LOAD ACTIVE USER
// =====================================================

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated. Token is required.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing in environment variables");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error",
      });
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// =====================================================
// ROLE-BASED AUTHORIZATION
// =====================================================

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission for this action",
      });
    }

    next();
  };
};

// =====================================================
// PERMISSION-BASED AUTHORIZATION
// =====================================================

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // Super admin has all permissions
    if (req.user.role === "super_admin") {
      return next();
    }

    const hasPermission = Boolean(
      req.user.permissions &&
      req.user.permissions[permission]
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Permission denied: ${permission}`,
      });
    }

    next();
  };
};

// =====================================================
// BACKWARD-COMPATIBLE ADMIN MIDDLEWARE
// =====================================================

const adminOnly = requireRole(
  "super_admin",
  "admin"
);

module.exports = {
  protect,
  requireRole,
  requirePermission,
  adminOnly,
};