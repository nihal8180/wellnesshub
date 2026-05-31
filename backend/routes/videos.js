const router = require('express').Router();
const Video  = require('../models/Video');
const { protect, adminOnly } = require('../middleware/auth');
const { syncChannelToMongo, searchVideosInMongo, generateAISummary } = require('../services/youtubeService');

// GET /api/videos?q=keyword&category=X&featured=true&limit=20&page=1
router.get('/', async (req, res) => {
  try {
    const { q, category, featured, limit = 20, page = 1 } = req.query;
    const filter = { published: true };

    if (q)        return res.json(await searchVideosInMongo(q));
    if (category) filter.category = category;
    if (featured) filter.featured = true;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments(filter);
    const items = await Video.find(filter).sort({ order: 1, publishedAt: -1 }).skip(skip).limit(parseInt(limit));

    res.json({ items, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/videos/:id/summary  — AI summary (cached in DB)
router.get('/:id/summary', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    const points = await generateAISummary(video);
    res.json({ points });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/sync  — pull latest videos from YouTube channel (admin)
router.post('/sync', protect, adminOnly, async (req, res) => {
  try {
    const Settings = require('../models/Settings');
    const setting  = await Settings.findOne({ key: 'youtubeChannelId' });
    const channelId = setting?.value || process.env.YOUTUBE_CHANNEL_ID;
    if (!channelId) return res.status(400).json({ error: 'Channel ID not configured' });

    const count = await syncChannelToMongo(channelId);
    res.json({ message: `Synced ${count} videos from YouTube` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/videos/:id  — update video (admin: featured, published, order, category)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const allowed = ['featured', 'published', 'order', 'category', 'tags'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const video = await Video.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/videos/:id  — remove from DB (doesn't delete from YouTube)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video removed from database' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
