const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  youtubeId:   { type: String, required: true, unique: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  thumbnail:   { type: String },
  channelTitle:{ type: String },
  publishedAt: { type: Date },
  duration:    { type: String },
  viewCount:   { type: Number, default: 0 },
  tags:        [String],
  category:    { type: String, default: 'General' },

  // AI-generated summary — cached so we don't call Claude every time
  aiSummary: {
    points:      [String],
    generatedAt: Date,
  },

  // Admin controls
  featured:  { type: Boolean, default: false },
  published: { type: Boolean, default: true },
  order:     { type: Number, default: 0 },

}, { timestamps: true });

videoSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Video', videoSchema);
