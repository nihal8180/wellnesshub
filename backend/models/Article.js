const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  slug:       { type: String, required: true, unique: true },
  content:    { type: String, required: true },   // Full HTML/Markdown body
  excerpt:    { type: String, required: true },   // Short preview (1-2 sentences)
  coverImage: { type: String },                   // URL
  author:     { type: String, default: 'WellnessHub Team' },
  category:   {
    type: String,
    enum: ['Nutrition', 'Mental Health', 'Fitness', 'Disease Awareness',
           'Preventive Care', 'Women Health', 'Heart Health', 'General'],
    default: 'General',
  },
  tags:       [String],
  published:  { type: Boolean, default: false },  // Draft until admin publishes
  featured:   { type: Boolean, default: false },
  views:      { type: Number, default: 0 },
  readTime:   { type: Number, default: 3 },       // Minutes

  // SEO
  metaTitle:       String,
  metaDescription: String,

}, { timestamps: true });

articleSchema.index({ title: 'text', content: 'text', tags: 'text' });
articleSchema.index({ slug: 1 });
articleSchema.index({ published: 1, featured: -1, createdAt: -1 });

module.exports = mongoose.model('Article', articleSchema);
