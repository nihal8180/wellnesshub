
const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    youtubeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    thumbnail: {
      type: String,
      default: "",
    },

    channelTitle: {
      type: String,
      default: "",
    },

    publishedAt: {
      type: Date,
    },

    duration: {
      type: String,
      default: "",
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    tags: [String],

    category: {
      type: String,
      default: "General",
      trim: true,
    },

    // Main videos or Health Update videos
    playlistType: {
      type: String,
      enum: ["main", "health_update"],
      default: "main",
      index: true,
    },

    // AI-generated summary
    aiSummary: {
      points: {
        type: [String],
        default: [],
      },

      generatedAt: {
        type: Date,
        default: null,
      },
    },

    // Admin controls
    featured: {
      type: Boolean,
      default: false,
    },

    published: {
      type: Boolean,
      default: true,
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Search index
videoSchema.index({
  title: "text",
  description: "text",
  tags: "text",
});

// Fast filtering and sorting
videoSchema.index({
  playlistType: 1,
  published: 1,
  featured: 1,
  publishedAt: -1,
});

videoSchema.index({
  playlistType: 1,
  order: 1,
});

module.exports = mongoose.model("Video", videoSchema);