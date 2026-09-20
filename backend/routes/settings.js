
const router = require("express").Router();

const Settings = require("../models/Settings");

const {
  protect,
  requirePermission,
} = require("../middleware/auth");

// Allowed settings keys
const ALLOWED_KEYS = [
  "youtube_channel_id",
  "health_update_playlist_id",
  "site_title",
  "site_description",
  "logo_url",
  "facebook_url",
  "instagram_url",
  "youtube_url",
  "twitter_url",
  "top_banner_ad",
  "right_sidebar_ad",
];

// --------------------------------------------------
// GET SETTING
// Public
// --------------------------------------------------

// GET /api/settings/:key
router.get("/:key", async (req, res) => {
  try {
    const { key } = req.params;

    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({
        success: false,
        error: "Invalid settings key",
      });
    }

    const setting = await Settings.findOne({ key }).lean();

    res.json({
      success: true,
      key,
      value: setting ? setting.value : null,
    });
  } catch (error) {
    console.error("Get settings error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch setting",
    });
  }
});

// --------------------------------------------------
// UPDATE SETTING
// Admin / Super Admin with permission
// --------------------------------------------------

// PUT /api/settings/:key
router.put(
  "/:key",
  protect,
  requirePermission("manageSettings"),
  async (req, res) => {
    try {
      const { key } = req.params;

      if (!ALLOWED_KEYS.includes(key)) {
        return res.status(400).json({
          success: false,
          error: "Invalid settings key",
        });
      }

      if (!Object.prototype.hasOwnProperty.call(req.body, "value")) {
        return res.status(400).json({
          success: false,
          error: "The value field is required",
        });
      }

      const setting = await Settings.findOneAndUpdate(
        { key },
        {
          $set: {
            value: req.body.value,
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      ).lean();

      res.json({
        success: true,
        message: "Setting updated successfully",
        setting,
      });
    } catch (error) {
      console.error("Update settings error:", error.message);

      res.status(500).json({
        success: false,
        error: "Failed to update setting",
      });
    }
  }
);

module.exports = router;