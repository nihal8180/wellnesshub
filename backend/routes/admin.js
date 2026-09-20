
const express = require("express");
const router = express.Router();

const Video = require("../models/Video");
const Article = require("../models/Article");
const User = require("../models/User");
const Settings = require("../models/Settings");

const { protect, requireRole } = require("../middleware/auth");
const {
  syncChannelToMongo,
  syncHealthUpdatePlaylist,
} = require("../services/youtubeService");

// All admin routes require authentication
router.use(protect);

// =====================================================
// DASHBOARD STATISTICS
// Accessible by admin and super_admin
// =====================================================

router.get(
  "/stats",
  requireRole("admin", "super_admin"),
  async (req, res) => {
    try {
      const [
        totalVideos,
        publishedVideos,
        totalArticles,
        publishedArticles,
        totalUsers,
      ] = await Promise.all([
        Video.countDocuments(),
        Video.countDocuments({ published: true }),
        Article.countDocuments(),
        Article.countDocuments({ published: true }),
        User.countDocuments(),
      ]);

      res.json({
        success: true,
        stats: {
          totalVideos,
          publishedVideos,
          totalArticles,
          publishedArticles,
          totalUsers,
        },
      });
    } catch (error) {
      console.error("Admin stats error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard statistics",
      });
    }
  }
);

// =====================================================
// YOUTUBE SYNCHRONIZATION
// Accessible by admin and super_admin
// =====================================================

router.post(
  "/sync-youtube",
  requireRole("admin", "super_admin"),
  async (req, res) => {
    try {
      const channelId =
        req.body.channelId ||
        process.env.YOUTUBE_CHANNEL_ID;

      const playlistId =
        req.body.playlistId ||
        process.env.HEALTH_UPDATE_PLAYLIST_ID;

      const maxResults =
        Math.min(
          Number(req.body.maxResults) || 50,
          50
        );

      if (!channelId) {
        return res.status(400).json({
          success: false,
          message: "YouTube channel ID is required",
        });
      }

      if (!playlistId) {
        return res.status(400).json({
          success: false,
          message:
            "Health Update playlist ID is required",
        });
      }

      const mainVideosSynced =
        await syncChannelToMongo(
          channelId,
          maxResults
        );

      const healthUpdateVideosSynced =
        await syncHealthUpdatePlaylist(
          playlistId,
          maxResults
        );

      res.json({
        success: true,
        message:
          "Main and Health Update videos synchronized successfully",

        result: {
          mainVideosSynced,
          healthUpdateVideosSynced,
          totalSynced:
            mainVideosSynced +
            healthUpdateVideosSynced,
        },
      });
    } catch (error) {
      console.error(
        "YouTube sync error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message: "YouTube synchronization failed",
      });
    }
  }
);

// =====================================================
// GET ALL USERS
// Only super_admin can manage users
// =====================================================

router.get(
  "/users",
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const users = await User.find()
        .select("-password")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        users,
      });
    } catch (error) {
      console.error("Get users error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
      });
    }
  }
);

// =====================================================
// CREATE USER
// Only super_admin can create users
// =====================================================

router.post(
  "/users",
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const {
        email,
        password,
        name,
        role = "editor",
      } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          message: "Email, password and name are required",
        });
      }

      const allowedRoles = [
        "admin",
        "editor",
        "contributor",
        "restricted",
      ];

      if (!allowedRoles.includes(role) && role !== "super_admin") {
        return res.status(400).json({
          success: false,
          message: "Invalid user role",
        });
      }

      const existingUser = await User.findOne({
        email: email.toLowerCase().trim(),
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }

      const user = await User.create({
        email: email.toLowerCase().trim(),
        password,
        name,
        role,
      });

      res.status(201).json({
        success: true,
        message: "User created successfully",
        user,
      });
    } catch (error) {
      console.error("Create user error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to create user",
      });
    }
  }
);

// =====================================================
// UPDATE USER
// Only super_admin can update users
// =====================================================

router.patch(
  "/users/:id",
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const userId = req.params.id;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Prevent changing your own account status or role
      if (user._id.toString() === req.user._id.toString()) {
        if (req.body.role && req.body.role !== user.role) {
          return res.status(400).json({
            success: false,
            message: "You cannot change your own role",
          });
        }

        if (req.body.active === false) {
          return res.status(400).json({
            success: false,
            message: "You cannot deactivate your own account",
          });
        }
      }

      const allowedRoles = [
        "super_admin",
        "admin",
        "editor",
        "contributor",
        "restricted",
      ];

      if (req.body.role && !allowedRoles.includes(req.body.role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user role",
        });
      }

      if (req.body.email) {
        user.email = req.body.email.toLowerCase().trim();
      }

      if (req.body.name !== undefined) {
        user.name = req.body.name;
      }

      if (req.body.role !== undefined) {
        user.role = req.body.role;
      }

      if (req.body.active !== undefined) {
        user.active = Boolean(req.body.active);
      }

      await user.save();

      res.json({
        success: true,
        message: "User updated successfully",
        user,
      });
    } catch (error) {
      console.error("Update user error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update user",
      });
    }
  }
);

module.exports = router;