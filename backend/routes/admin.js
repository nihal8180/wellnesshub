const router   = require('express').Router();
const Video    = require('../models/Video');
const Article  = require('../models/Article');
const User     = require('../models/User');
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');
const { syncChannelToMongo } = require('../services/youtubeService');

// All admin routes require auth
router.use(protect, adminOnly);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [totalVideos, publishedVideos, featuredVideos,
           totalArticles, publishedArticles, draftArticles,
           totalViews] = await Promise.all([
      Video.countDocuments(),
      Video.countDocuments({ published: true }),
      Video.countDocuments({ featured: true }),
      Article.countDocuments(),
      Article.countDocuments({ published: true }),
      Article.countDocuments({ published: false }),
      Article.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
    ]);
    res.json({
      videos: { total: totalVideos, published: publishedVideos, featured: featuredVideos },
      articles: { total: totalArticles, published: publishedArticles, drafts: draftArticles },
      totalArticleViews: totalViews[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/sync-youtube  — manual YouTube sync
router.post('/sync-youtube', async (req, res) => {
  try {
    const setting   = await Settings.findOne({ key: 'youtubeChannelId' });
    const channelId = setting?.value || process.env.YOUTUBE_CHANNEL_ID;
    if (!channelId) return res.status(400).json({ error: 'Channel ID not set in settings' });
    const count = await syncChannelToMongo(channelId);
    res.json({ message: `Synced ${count} videos`, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET/PUT /api/admin/users  — user management
router.get('/users', async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    const user = await User.create({ email, password, name, role });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const allowed = ['name', 'role', 'active'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
