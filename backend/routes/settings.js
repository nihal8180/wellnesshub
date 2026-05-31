const router   = require('express').Router();
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/settings/:key  — public (channel info etc)
router.get('/:key', async (req, res) => {
  try {
    const s = await Settings.findOne({ key: req.params.key });
    res.json(s || { key: req.params.key, value: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:key  — admin only
router.put('/:key', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOneAndUpdate(
      { key: req.params.key },
      { value: req.body.value },
      { upsert: true, new: true }
    );
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
