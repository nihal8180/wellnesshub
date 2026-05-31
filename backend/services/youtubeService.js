const axios = require('axios');
const Video = require('../models/Video');

const yt = axios.create({ baseURL: 'https://www.googleapis.com/youtube/v3' });

// ─── YouTube helpers ───────────────────────────────────────────────────────────

async function resolveChannelId(channelId) {
  if (!channelId.startsWith('@')) return channelId;
  const { data } = await yt.get('/channels', {
    params: { part: 'id', forHandle: channelId.slice(1), key: process.env.YOUTUBE_API_KEY },
  });
  return data.items?.[0]?.id || null;
}

async function fetchChannelVideos(channelId, maxResults = 50) {
  const resolved = await resolveChannelId(channelId);
  const { data } = await yt.get('/search', {
    params: {
      part: 'snippet', channelId: resolved,
      maxResults, order: 'date', type: 'video',
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  const videoIds = data.items.map(i => i.id.videoId).join(',');
  const { data: details } = await yt.get('/videos', {
    params: { part: 'snippet,contentDetails,statistics', id: videoIds, key: process.env.YOUTUBE_API_KEY },
  });

  return details.items.map(v => ({
    youtubeId:    v.id,
    title:        v.snippet.title,
    description:  v.snippet.description,
    thumbnail:    v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
    channelTitle: v.snippet.channelTitle,
    publishedAt:  v.snippet.publishedAt,
    duration:     v.contentDetails?.duration,
    viewCount:    parseInt(v.statistics?.viewCount || 0),
    tags:         v.snippet?.tags || [],
  }));
}

async function syncChannelToMongo(channelId) {
  const videos = await fetchChannelVideos(channelId);
  let synced = 0;
  for (const v of videos) {
    await Video.findOneAndUpdate({ youtubeId: v.youtubeId }, v, { upsert: true, new: true });
    synced++;
  }
  return synced;
}

async function searchVideosInMongo(query) {
  return Video.find(
    { $text: { $search: query }, published: true },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } }).limit(20);
}

// ─── AI Summary: tries 3 methods in order ─────────────────────────────────────
// 1. Hugging Face (free, no credit card)
// 2. Ollama local model (if installed)
// 3. Smart local summarizer (always works, no internet needed)

async function generateAISummary(video) {
  // Return cached summary if fresh (< 30 days)
  if (video.aiSummary?.points?.length && video.aiSummary.generatedAt) {
    const age = Date.now() - new Date(video.aiSummary.generatedAt).getTime();
    if (age < 30 * 24 * 60 * 60 * 1000) return video.aiSummary.points;
  }

  let points = null;

  // ── Method 1: Hugging Face Inference API (FREE) ──────────────────────────
  // Sign up at huggingface.co → Settings → Access Tokens → New token (free)
  // Add HF_TOKEN=hf_xxxxxxxxxxxxxxx to your .env
  if (process.env.HF_TOKEN) {
    try {
      points = await summarizeWithHuggingFace(video);
      console.log('Summary generated via Hugging Face');
    } catch (e) {
      console.warn('HuggingFace failed:', e.message, '— trying next method');
    }
  }

  // ── Method 2: Ollama local (FREE, runs on your machine) ─────────────────
  // Install from ollama.com, then: ollama pull llama3.2
  // No token needed, runs fully offline
  if (!points && process.env.OLLAMA_URL) {
    try {
      points = await summarizeWithOllama(video);
      console.log('Summary generated via Ollama (local)');
    } catch (e) {
      console.warn('Ollama failed:', e.message, '— using local fallback');
    }
  }

  // ── Method 3: Smart local summarizer (NO API, always works) ─────────────
  if (!points) {
    points = localSummarize(video);
    console.log('Summary generated via local summarizer');
  }

  // Cache in DB
  video.aiSummary = { points, generatedAt: new Date() };
  await video.save();
  return points;
}

// ── Hugging Face (completely free tier) ───────────────────────────────────────
async function summarizeWithHuggingFace(video) {
  const prompt = buildPrompt(video);

  // Using facebook/bart-large-cnn — best free summarization model
  const { data } = await axios.post(
    'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
    { inputs: prompt, parameters: { max_length: 300, min_length: 100 } },
    {
      headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` },
      timeout: 30000,
    }
  );

  const rawSummary = data[0]?.summary_text || '';
  if (!rawSummary) throw new Error('Empty response from HuggingFace');

  // Convert paragraph summary into bullet points
  return paragraphToPoints(rawSummary, video.title);
}

// ── Ollama (local, fully free, runs on your own PC) ───────────────────────────
async function summarizeWithOllama(video) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model     = process.env.OLLAMA_MODEL || 'llama3.2';
  const prompt    = buildPrompt(video);

  const { data } = await axios.post(`${ollamaUrl}/api/generate`, {
    model,
    prompt: `${prompt}\n\nRespond ONLY with a JSON array of 5-7 strings, each being one key point. No extra text.\nExample: ["Point one","Point two"]`,
    stream: false,
  }, { timeout: 60000 });

  const raw    = data.response || '[]';
  const clean  = raw.replace(/```json|```/g, '').trim();
  const match  = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in Ollama response');
  return JSON.parse(match[0]);
}

// ── Smart local summarizer (no API at all) ────────────────────────────────────
function localSummarize(video) {
  const title = video.title || '';
  const desc  = video.description || '';
  const tags  = (video.tags || []).join(', ');

  // Extract meaningful sentences from description
  const sentences = desc
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 300)
    .filter(s => !s.match(/^(http|www|follow|subscribe|like|share|comment|check out|click|visit)/i))
    .slice(0, 10);

  // Build smart points from title + description
  const points = [];

  // Point 1: What this video is about (from title)
  const topic = extractTopic(title);
  points.push(`This video covers ${topic} — a key area of health awareness and wellness education.`);

  // Points 2-5: from description sentences
  const picked = pickBestSentences(sentences, 4);
  picked.forEach(s => points.push(cleanSentence(s)));

  // Point from tags if available
  if (tags && points.length < 6) {
    points.push(`Key topics discussed include: ${tags.split(',').slice(0, 4).join(', ')}.`);
  }

  // Final point
  points.push(`Watch the full video for detailed guidance, practical tips, and expert insights on ${topic}.`);

  return points.slice(0, 7);
}

function extractTopic(title) {
  return title
    .replace(/\|.*$/, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/^\d+[\.\)]\s*/, '')
    .trim()
    .toLowerCase()
    .replace(/^(how to|what is|why|when|top \d+|best|the|a|an)\s+/i, '')
    .trim() || title.trim();
}

function pickBestSentences(sentences, count) {
  const healthKeywords = /health|diet|nutrition|exercise|symptom|disease|treatment|prevent|vitamin|mineral|protein|sugar|blood|heart|brain|mental|stress|sleep|weight|diabetes|cancer|immune|medicine|doctor|body|food|eat|drink|lifestyle/i;
  const scored = sentences.map(s => ({
    s,
    score: (s.match(healthKeywords) || []).length + (s.length > 80 ? 1 : 0)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(x => x.s);
}

function cleanSentence(s) {
  return s.replace(/\s+/g, ' ').replace(/^[-•*]\s*/, '').trim();
}

function buildPrompt(video) {
  return `Health video: "${video.title}"
Channel: ${video.channelTitle || 'Health Channel'}
Description: ${(video.description || 'No description provided').slice(0, 600)}

Summarize the key health points from this video in simple, clear language.`;
}

function paragraphToPoints(text, title) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30);

  if (sentences.length >= 3) return sentences.slice(0, 7);

  // If too short, pad with title-based point
  const topic = extractTopic(title);
  return [
    `This video focuses on ${topic}.`,
    text.trim(),
    `Watch the full video for detailed insights on ${topic}.`,
  ];
}

module.exports = { syncChannelToMongo, searchVideosInMongo, generateAISummary, fetchChannelVideos };
