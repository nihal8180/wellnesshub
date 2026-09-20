
const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    content: {
      type: String,
      required: true,
    },

    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    coverImage: {
      type: String,
      trim: true,
    },

    author: {
      type: String,
      default: "HealthInk Team",
      trim: true,
    },

   category: {
  type: String,
  enum: [
    "Health News",
    "Nutrition",
    "Mental Health",
    "Fitness",
    "Disease Awareness",
    "Preventive Care",
    "Women Health",
    "Heart Health",
    "General",
  ],
  default: "General",
},

    tags: {
      type: [String],
      default: [],
    },

    published: {
      type: Boolean,
      default: false,
      index: true,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    views: {
      type: Number,
      default: 0,
      min: 0,
    },

    readTime: {
      type: Number,
      default: 3,
      min: 1,
    },

    metaTitle: {
      type: String,
      trim: true,
      maxlength: 60,
    },

    metaDescription: {
      type: String,
      trim: true,
      maxlength: 160,
    },
  },
  {
    timestamps: true,
  }
);

// Text search
articleSchema.index({
  title: "text",
  content: "text",
  tags: "text",
});

// Listing and filtering
articleSchema.index({
  published: 1,
  featured: -1,
  createdAt: -1,
});

// Updated articles
articleSchema.index({
  updatedAt: -1,
});

module.exports = mongoose.model("Article", articleSchema);