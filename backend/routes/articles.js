const router  = require('express').Router();
const Article = require('../models/Article');
const { protect, adminOnly } = require('../middleware/auth');

const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// GET /api/articles?category=X&featured=true&q=keyword&limit=10&page=1
router.get('/', async (req, res) => {
  try {
    const { category, featured, q, limit = 10, page = 1 } = req.query;
    const filter = { published: true };

    if (category) filter.category = category;
    if (featured) filter.featured = true;
    if (q) {
      filter.$text = { $search: q };
      const skip  = (parseInt(page) - 1) * parseInt(limit);
      const items = await Article.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } }).skip(skip).limit(parseInt(limit))
        .select('-content');
      return res.json({ items, total: items.length, page: parseInt(page) });
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Article.countDocuments(filter);
    const items = await Article.find(filter)
      .sort({ featured: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit))
      .select('-content');  // Exclude body from list to keep payload small

    res.json({ items, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/categories
router.get('/categories', async (req, res) => {
  const cats = Article.schema.path('category').enumValues;
  res.json(cats);
});

// GET /api/articles/id/:id  — full article by MongoDB _id (public)
router.get('/id/:id', async (req, res) => {
  try {
    const article = await Article.findOneAndUpdate(
      { _id: req.params.id, published: true },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:slug  — full article by slug (public)
router.get('/:slug', async (req, res) => {
  try {
    const article = await Article.findOneAndUpdate(
      { slug: req.params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────

// GET /api/articles/admin/all  — all articles including drafts
router.get('/admin/all', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Article.countDocuments();
    const items = await Article.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).select('-content');
    res.json({ items, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/admin/:id  — get single article by id (for editing)
router.get('/admin/:id', protect, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles  — create new article
router.post('/', protect, async (req, res) => {
  try {
    const { title, content, excerpt, coverImage, category, tags, published, featured, readTime, metaTitle, metaDescription } = req.body;
    if (!title || !content || !excerpt) return res.status(400).json({ error: 'title, content, and excerpt are required' });

    let slug = slugify(title);
    // Ensure unique slug
    const existing = await Article.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now()}`;

    const article = await Article.create({
      title, slug, content, excerpt, coverImage, category, tags,
      published: published || false, featured: featured || false,
      readTime: readTime || Math.ceil(content.split(' ').length / 200),
      author: req.user.name,
      metaTitle, metaDescription,
    });
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/articles/:id  — full update
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, content, excerpt, coverImage, category, tags, published, featured, readTime, metaTitle, metaDescription } = req.body;
    const update = { title, content, excerpt, coverImage, category, tags, published, featured, readTime, metaTitle, metaDescription };

    // Re-slug if title changed
    if (title) {
      const current = await Article.findById(req.params.id);
      if (current && current.title !== title) update.slug = slugify(title);
    }
    if (content) update.readTime = readTime || Math.ceil(content.split(' ').length / 200);

    const article = await Article.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/articles/:id  — partial update (e.g. toggle published/featured)
router.patch('/:id', protect, async (req, res) => {
  try {
    const allowed = ['published', 'featured', 'category', 'tags', 'coverImage'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const article = await Article.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/articles/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// POST /api/articles/generate-from-video/:videoId
// Generates a full health article from a video using AI (or smart local fallback)
router.post('/generate-from-video/:videoId', protect, async (req, res) => {
  try {
    const Video = require('../models/Video');
    const video = await Video.findById(req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const article = await generateArticleFromVideo(video);

    // Auto-save as draft
    let slug = slugify(article.title);
    const existing = await Article.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now()}`;

    const saved = await Article.create({
      title:       article.title,
      slug,
      content:     article.content,
      excerpt:     article.excerpt,
      category:    article.category,
      tags:        article.tags,
      author:      req.user.name,
      coverImage:  video.thumbnail || '',
      published:   false,  // saved as draft — admin reviews before publishing
      readTime:    Math.ceil(article.content.split(' ').length / 200),
    });

    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Article generator (free, no paid API needed) ─────────────────────────────
async function generateArticleFromVideo(video) {
  const title       = video.title || '';
  const description = video.description || '';
  const tags        = video.tags || [];

  // Try Hugging Face first if token available
  if (process.env.HF_TOKEN) {
    try { return await generateWithHF(video); } catch (e) { console.warn('HF article gen failed:', e.message); }
  }

  // Smart local generator (always works)
  return generateLocalArticle(video);
}

async function generateWithHF(video) {
  const axios = require('axios');
  const input = `Write a detailed health article about: ${video.title}. ${(video.description||'').slice(0,500)}`;

  const { data } = await axios.post(
    'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
    { inputs: input, parameters: { max_length: 500, min_length: 200 } },
    { headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` }, timeout: 30000 }
  );

  const summary = data[0]?.summary_text || '';
  if (!summary) throw new Error('Empty HF response');

  return buildArticleFromSummary(video, summary);
}

function generateLocalArticle(video) {
  const title = video.title || 'Health Article';
  const desc  = video.description || '';
  const tags  = video.tags || [];

  // Extract sentences from description
  const sentences = desc
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 400)
    .filter(s => !s.match(/^(http|subscribe|follow|like|share|click|visit|check out)/i));

  const topic    = title.replace(/\|.*$/, '').replace(/\[.*?\]/g, '').trim();
  const category = detectCategory(title + ' ' + desc);
  const keyTags  = tags.slice(0, 6).length ? tags.slice(0, 6) : extractKeywords(title + ' ' + desc);

  // Build sections
  const intro = sentences.slice(0, 2).join(' ') ||
    `${topic} is an important health topic that affects millions of people. Understanding it can help you make better decisions for your health and wellbeing.`;

  const body = buildBodySections(topic, sentences.slice(2));

  const content = `<h2>Introduction</h2>
<p>${intro}</p>

${body}

<h2>Key Takeaways</h2>
<ul>
${keyTags.map(t => `  <li>Learn about <strong>${t}</strong> and how it affects your health</li>`).join('\n')}
  <li>Early awareness and prevention are the best approaches</li>
  <li>Always consult your doctor for personalized medical advice</li>
</ul>

<h2>Watch the Full Video</h2>
<p>For a complete, detailed explanation of <strong>${topic}</strong>, watch the full video on the <a href="https://www.youtube.com/@healthink" target="_blank">@healthink YouTube channel</a>. Our health experts break down complex medical information in simple, easy-to-understand language.</p>

<p><em>Disclaimer: This article is for educational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional for diagnosis and treatment.</em></p>`;

  const excerpt = `${intro.slice(0, 180)}${intro.length > 180 ? '...' : ''}`;

  return { title: `${topic} — Complete Health Guide`, content, excerpt, category, tags: keyTags };
}

function buildArticleFromSummary(video, summary) {
  const topic    = video.title.replace(/\|.*$/, '').trim();
  const category = detectCategory(video.title + ' ' + video.description);
  const keyTags  = video.tags?.slice(0, 6) || extractKeywords(video.title);

  const content = `<h2>Overview</h2>
<p>${summary}</p>

<h2>Why This Matters for Your Health</h2>
<p>Understanding ${topic} is essential for maintaining good health. This video from the @healthink channel covers important aspects that everyone should know.</p>

<h2>Key Points</h2>
<ul>
${keyTags.map(t => `  <li><strong>${t}</strong> — an important aspect covered in this video</li>`).join('\n')}
</ul>

<h2>Watch the Full Video</h2>
<p>For complete details, watch the full video on <a href="https://www.youtube.com/@healthink" target="_blank">@healthink YouTube channel</a>.</p>

<p><em>Disclaimer: For educational purposes only. Consult your doctor for medical advice.</em></p>`;

  return {
    title:   `${topic} — Health Guide`,
    content,
    excerpt: summary.slice(0, 200) + '...',
    category,
    tags: keyTags,
  };
}

function buildBodySections(topic, sentences) {
  if (!sentences.length) {
    return `<h2>Understanding ${topic}</h2>
<p>${topic} is a health condition that requires awareness and proper medical guidance. It is important to recognize the signs early and seek appropriate treatment.</p>

<h2>Prevention and Care</h2>
<p>Preventing and managing ${topic} involves a combination of lifestyle changes, medical treatment, and regular health checkups. Always follow your doctor's advice for the best outcomes.</p>`;
  }

  const mid   = Math.floor(sentences.length / 2);
  const part1 = sentences.slice(0, mid).join(' ');
  const part2 = sentences.slice(mid).join(' ');

  return `<h2>Understanding ${topic}</h2>
<p>${part1 || `${topic} is an important health topic that requires proper awareness and medical attention.`}</p>

<h2>Treatment and Prevention</h2>
<p>${part2 || `Prevention and early treatment of ${topic} can significantly improve health outcomes. Consult a healthcare professional for personalized advice.`}</p>`;
}

function detectCategory(text) {
  const t = text.toLowerCase();
  if (t.match(/child|baby|infant|kid|pediatric/))    return 'Women Health';
  if (t.match(/heart|cardiac|blood pressure|bp/))    return 'Heart Health';
  if (t.match(/diet|nutrition|food|vitamin|eat/))    return 'Nutrition';
  if (t.match(/mental|anxiety|depression|stress/))   return 'Mental Health';
  if (t.match(/exercise|yoga|fitness|workout/))      return 'Fitness';
  if (t.match(/allerg|asthma|diabetes|cancer/))      return 'Disease Awareness';
  if (t.match(/prevent|vaccine|screen|check/))       return 'Preventive Care';
  return 'General';
}

function extractKeywords(text) {
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','this','that','these','those','i','we','you','he','she','it','they','and','or','but','in','on','at','to','for','of','with','by','from','about']);
  const freq = {};
  text.toLowerCase()
    .replace(/[^a-z\u0900-\u097f\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

