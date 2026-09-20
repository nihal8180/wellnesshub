
const router = require("express").Router();
const mongoose = require("mongoose");

const Article = require("../models/Article");
const Video = require("../models/Video");

const {
  protect,
  requirePermission,
} = require("../middleware/auth");

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const slugify = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getPagination = (query, defaultLimit = 10) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || defaultLimit, 1),
    50
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const createUniqueSlug = async (title, excludeId = null) => {
  let baseSlug = slugify(title) || `article-${Date.now()}`;
  let slug = baseSlug;
  let counter = 1;

  while (
    await Article.exists({
      slug,
      ...(excludeId
        ? { _id: { $ne: excludeId } }
        : {}),
    })
  ) {
    slug = `${baseSlug}-${counter++}`;
  }

  return slug;
};

const calculateReadTime = (content = "") => {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
};

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

// --------------------------------------------------
// PUBLIC ROUTES
// --------------------------------------------------

// GET /api/articles
router.get("/", async (req, res) => {
  try {
    const {
      category,
      featured,
      q,
      language,
    } = req.query;

    const { page, limit, skip } = getPagination(req.query);

    const filter = {
      published: true,
    };

    if (category) {
      filter.category = category;
    }

    if (language) {
      filter.language = language;
    }

    if (featured !== undefined) {
      filter.featured = featured === "true";
    }

    if (q && q.trim()) {
      filter.$text = {
        $search: q.trim(),
      };
    }

    const total = await Article.countDocuments(filter);

    let query = Article.find(filter).select("-content");

    if (q && q.trim()) {
      query = query
        .select({
          score: {
            $meta: "textScore",
          },
        })
        .sort({
          score: {
            $meta: "textScore",
          },
        });
    } else {
      query = query.sort({
        featured: -1,
        createdAt: -1,
      });
    }

    const items = await query
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get articles error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch articles",
    });
  }
});

// GET /api/articles/categories
router.get("/categories", async (req, res) => {
  try {
    const categories =
      Article.schema.path("category").enumValues;

    res.json({
      success: true,
      items: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
});

// --------------------------------------------------
// ADMIN ROUTES
// Keep these BEFORE /:slug
// --------------------------------------------------

// GET /api/articles/admin/all
router.get(
  "/admin/all",
  protect,
  requirePermission("editArticles"),
  async (req, res) => {
    try {
      const { page, limit, skip } = getPagination(
        req.query,
        20
      );

      const filter = {};

      if (req.query.published !== undefined) {
        filter.published =
          req.query.published === "true";
      }

      if (req.query.category) {
        filter.category = req.query.category;
      }

      const total = await Article.countDocuments(filter);

      const items = await Article.find(filter)
        .select("-content")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      res.json({
        success: true,
        items,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Admin articles error:", error.message);

      res.status(500).json({
        success: false,
        error: "Failed to fetch admin articles",
      });
    }
  }
);

// GET /api/articles/admin/:id
router.get(
  "/admin/:id",
  protect,
  requirePermission("editArticles"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid article ID",
        });
      }

      const article = await Article.findById(req.params.id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: "Article not found",
        });
      }

      res.json({
        success: true,
        article,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch article",
      });
    }
  }
);

// --------------------------------------------------
// CREATE ARTICLE
// --------------------------------------------------

// POST /api/articles
router.post(
  "/",
  protect,
  requirePermission("createArticles"),
  async (req, res) => {
    try {
      const {
        title,
        content,
        excerpt,
        coverImage,
        category,
        tags,
        published,
        featured,
        readTime,
        metaTitle,
        metaDescription,
        language,
      } = req.body;

      if (!title?.trim() || !content?.trim() || !excerpt?.trim()) {
        return res.status(400).json({
          success: false,
          error: "Title, content, and excerpt are required",
        });
      }

      // Users without publishing permission can only create drafts
      const canPublish =
        req.user.role === "super_admin" ||
        req.user.permissions?.publishArticles === true;

      const finalPublished = canPublish
        ? published === true
        : false;

      const slug = await createUniqueSlug(title);

      const article = await Article.create({
        title: title.trim(),
        slug,
        content,
        excerpt: excerpt.trim(),
        coverImage,
        category,
        tags: Array.isArray(tags) ? tags : [],
        published: finalPublished,
        featured: canPublish ? featured === true : false,
        readTime: readTime || calculateReadTime(content),
        author: req.user.name || "HealthInk Team",
        metaTitle,
        metaDescription,
        language: language || "en",
      });

      res.status(201).json({
        success: true,
        message: "Article created successfully",
        article,
      });
    } catch (error) {
      console.error("Create article error:", error.message);

      res.status(500).json({
        success: false,
        error: "Failed to create article",
      });
    }
  }
);

// --------------------------------------------------
// UPDATE ARTICLE
// --------------------------------------------------

// PUT /api/articles/:id
router.put(
  "/:id",
  protect,
  requirePermission("editArticles"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid article ID",
        });
      }

      const currentArticle = await Article.findById(id);

      if (!currentArticle) {
        return res.status(404).json({
          success: false,
          error: "Article not found",
        });
      }

      const {
        title,
        content,
        excerpt,
        coverImage,
        category,
        tags,
        published,
        featured,
        readTime,
        metaTitle,
        metaDescription,
        language,
      } = req.body;

      const update = {};

      if (title !== undefined) {
        update.title = title.trim();

        if (update.title !== currentArticle.title) {
          update.slug = await createUniqueSlug(
            update.title,
            id
          );
        }
      }

      if (content !== undefined) {
        update.content = content;
        update.readTime =
          readTime || calculateReadTime(content);
      }

      if (excerpt !== undefined) {
        update.excerpt = excerpt.trim();
      }

      if (coverImage !== undefined) {
        update.coverImage = coverImage;
      }

      if (category !== undefined) {
        update.category = category;
      }

      if (tags !== undefined) {
        update.tags = Array.isArray(tags) ? tags : [];
      }

      if (metaTitle !== undefined) {
        update.metaTitle = metaTitle;
      }

      if (metaDescription !== undefined) {
        update.metaDescription = metaDescription;
      }

      if (language !== undefined) {
        update.language = language;
      }

      const canPublish =
        req.user.role === "super_admin" ||
        req.user.permissions?.publishArticles === true;

      if (published !== undefined) {
        update.published = canPublish
          ? published === true
          : currentArticle.published;
      }

      if (featured !== undefined) {
        update.featured = canPublish
          ? featured === true
          : currentArticle.featured;
      }

      const article = await Article.findByIdAndUpdate(
        id,
        update,
        {
          new: true,
          runValidators: true,
        }
      );

      res.json({
        success: true,
        message: "Article updated successfully",
        article,
      });
    } catch (error) {
      console.error("Update article error:", error.message);

      res.status(500).json({
        success: false,
        error: "Failed to update article",
      });
    }
  }
);

// --------------------------------------------------
// PARTIAL UPDATE
// --------------------------------------------------

// PATCH /api/articles/:id
router.patch(
  "/:id",
  protect,
  requirePermission("editArticles"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid article ID",
        });
      }

      const allowedFields = [
        "category",
        "tags",
        "coverImage",
        "metaTitle",
        "metaDescription",
        "language",
      ];

      const update = {};

      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          update[field] = req.body[field];
        }
      });

      const canPublish =
        req.user.role === "super_admin" ||
        req.user.permissions?.publishArticles === true;

      if (
        req.body.published !== undefined &&
        canPublish
      ) {
        update.published = req.body.published === true;
      }

      if (
        req.body.featured !== undefined &&
        canPublish
      ) {
        update.featured = req.body.featured === true;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid fields provided",
        });
      }

      const article = await Article.findByIdAndUpdate(
        id,
        update,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!article) {
        return res.status(404).json({
          success: false,
          error: "Article not found",
        });
      }

      res.json({
        success: true,
        message: "Article updated successfully",
        article,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update article",
      });
    }
  }
);

// --------------------------------------------------
// DELETE ARTICLE
// --------------------------------------------------

// DELETE /api/articles/:id
router.delete(
  "/:id",
  protect,
  requirePermission("deleteContent"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid article ID",
        });
      }

      const article = await Article.findByIdAndDelete(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: "Article not found",
        });
      }

      res.json({
        success: true,
        message: "Article deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to delete article",
      });
    }
  }
);

// --------------------------------------------------
// GENERATE ARTICLE FROM VIDEO
// --------------------------------------------------

// POST /api/articles/generate-from-video/:videoId
router.post(
  "/generate-from-video/:videoId",
  protect,
  requirePermission("createArticles"),
  async (req, res) => {
    try {
      const { videoId } = req.params;

      if (!isValidObjectId(videoId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid video ID",
        });
      }

      const video = await Video.findById(videoId);

      if (!video) {
        return res.status(404).json({
          success: false,
          error: "Video not found",
        });
      }

      const generatedArticle =
        await generateArticleFromVideo(video);

      const slug = await createUniqueSlug(
        generatedArticle.title
      );

      const savedArticle = await Article.create({
        title: generatedArticle.title,
        slug,
        content: generatedArticle.content,
        excerpt: generatedArticle.excerpt,
        category: generatedArticle.category,
        tags: generatedArticle.tags || [],
        author: req.user.name || "HealthInk Team",
        coverImage: video.thumbnail || "",
        published: false,
        featured: false,
        readTime: calculateReadTime(
          generatedArticle.content
        ),
        language: generatedArticle.language || "en",
      });

      res.status(201).json({
        success: true,
        message: "AI article generated and saved as draft",
        article: savedArticle,
      });
    } catch (error) {
      console.error(
        "Generate article error:",
        error.message
      );

      res.status(500).json({
        success: false,
        error: "Failed to generate article",
      });
    }
  }
);

// --------------------------------------------------
// PUBLIC ARTICLE BY ID
// Keep after admin routes
// --------------------------------------------------

// GET /api/articles/id/:id
router.get("/id/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid article ID",
      });
    }

    const article = await Article.findOneAndUpdate(
      {
        _id: req.params.id,
        published: true,
      },
      {
        $inc: {
          views: 1,
        },
      },
      {
        new: true,
      }
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        error: "Article not found",
      });
    }

    res.json({
      success: true,
      article,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch article",
    });
  }
});

// --------------------------------------------------
// PUBLIC ARTICLE BY SLUG
// Must be LAST
// --------------------------------------------------

// GET /api/articles/:slug
router.get("/:slug", async (req, res) => {
  try {
    const article = await Article.findOneAndUpdate(
      {
        slug: req.params.slug,
        published: true,
      },
      {
        $inc: {
          views: 1,
        },
      },
      {
        new: true,
      }
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        error: "Article not found",
      });
    }

    res.json({
      success: true,
      article,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch article",
    });
  }
});

// --------------------------------------------------
// AI ARTICLE GENERATOR
// --------------------------------------------------

async function generateArticleFromVideo(video) {
  // Local generator is used as a reliable fallback.
  // You can connect Groq/OpenAI here later.

  return generateLocalArticle(video);
}

function generateLocalArticle(video) {
  const title = video.title || "Health Article";
  const description = video.description || "";
  const tags = video.tags || [];

  const topic = title
    .replace(/\|.*$/, "")
    .replace(/\[.*?\]/g, "")
    .trim();

  const sentences = description
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length > 40 &&
        sentence.length < 400
    )
    .filter(
      (sentence) =>
        !/^(http|subscribe|follow|like|share|click|visit|check out)/i.test(
          sentence
        )
    );

  const category = detectCategory(
    `${title} ${description}`
  );

  const keyTags = tags.slice(0, 6).length
    ? tags.slice(0, 6)
    : extractKeywords(`${title} ${description}`);

  const intro =
    sentences.slice(0, 2).join(" ") ||
    `${topic} is an important health topic. Understanding the available information can help people make informed decisions about their health.`;

  const body = buildBodySections(
    topic,
    sentences.slice(2)
  );

  const content = `
<h2>Introduction</h2>
<p>${escapeHtml(intro)}</p>

${body}

<h2>Key Takeaways</h2>
<ul>
${keyTags
  .map(
    (tag) =>
      `<li>Learn about <strong>${escapeHtml(
        tag
      )}</strong> and its relevance to health.</li>`
  )
  .join("\n")}
<li>Follow reliable health information and preventive practices.</li>
<li>Consult a qualified healthcare professional for personal advice.</li>
</ul>

<h2>Watch the Full Video</h2>
<p>
For more information, watch the complete video on the
<a href="https://www.youtube.com/@healthink" target="_blank">
HealthInk YouTube channel
</a>.
</p>

<p>
<em>
Disclaimer: This article is for educational purposes only
and does not constitute medical advice.
</em>
</p>
`;

  const excerpt =
    intro.length > 200
      ? `${intro.slice(0, 200)}...`
      : intro;

  return {
    title: `${topic} — Complete Health Guide`,
    content,
    excerpt,
    category,
    tags: keyTags,
    language: "en",
  };
}

function buildBodySections(topic, sentences) {
  if (!sentences.length) {
    return `
<h2>Understanding ${escapeHtml(topic)}</h2>
<p>
Understanding this topic requires reliable information
and appropriate medical guidance.
</p>

<h2>Prevention and Care</h2>
<p>
Prevention and care may involve lifestyle changes,
regular checkups, and guidance from healthcare professionals.
</p>
`;
  }

  const midpoint = Math.floor(sentences.length / 2);

  const part1 = sentences.slice(0, midpoint).join(" ");
  const part2 = sentences.slice(midpoint).join(" ");

  return `
<h2>Understanding ${escapeHtml(topic)}</h2>
<p>${escapeHtml(part1 || topic)}</p>

<h2>Treatment and Prevention</h2>
<p>${escapeHtml(part2 || "Consult a healthcare professional for guidance.")}</p>
`;
}

function detectCategory(text = "") {
  const value = text.toLowerCase();

  if (/heart|cardiac|blood pressure|bp/.test(value)) {
    return "Heart Health";
  }

  if (/diet|nutrition|food|vitamin|eat/.test(value)) {
    return "Nutrition";
  }

  if (/mental|anxiety|depression|stress/.test(value)) {
    return "Mental Health";
  }

  if (/exercise|yoga|fitness|workout/.test(value)) {
    return "Fitness";
  }

  if (/allerg|asthma|diabetes|cancer/.test(value)) {
    return "Disease Awareness";
  }

  if (/prevent|vaccine|screen|check/.test(value)) {
    return "Preventive Care";
  }

  return "General";
}

function extractKeywords(text = "") {
  const stopWords = new Set([
    "the",
    "and",
    "this",
    "that",
    "with",
    "from",
    "about",
    "your",
    "have",
    "will",
    "into",
    "their",
    "there",
    "which",
    "what",
    "when",
    "where",
    "health",
  ]);

  const frequency = {};

  text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !stopWords.has(word)
    )
    .forEach((word) => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = router;