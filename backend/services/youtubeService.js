const axios = require('axios');
const Video = require('../models/Video');

const yt = axios.create({ baseURL: 'https://www.googleapis.com/youtube/v3' });

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
    params: { part: 'snippet', channelId: resolved, maxResults, order: 'date', type: 'video', key: process.env.YOUTUBE_API_KEY },
  });
  const videoIds = data.items.map(i => i.id.videoId).join(',');
  const { data: details } = await yt.get('/videos', {
    params: { part: 'snippet,contentDetails,statistics', id: videoIds, key: process.env.YOUTUBE_API_KEY },
  });
  return details.items.map(v => ({
    youtubeId: v.id, title: v.snippet.title, description: v.snippet.description,
    thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
    channelTitle: v.snippet.channelTitle, publishedAt: v.snippet.publishedAt,
    duration: v.contentDetails?.duration, viewCount: parseInt(v.statistics?.viewCount || 0),
    tags: v.snippet?.tags || [],
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
  return Video.find({ $text: { $search: query }, published: true }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } }).limit(20);
}

async function getTranscript(youtubeId) {
  try {
    const { YoutubeTranscript } = require('youtube-transcript');
    const transcript = await YoutubeTranscript.fetchTranscript(youtubeId);
    return transcript.map(t => t.text).join(' ').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.warn('Transcript not available:', e.message);
    return null;
  }
}

async function summarizeWithGroq(text, title) {
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: 'llama3-8b-8192',
    messages: [
      { role: 'system', content: 'You are a health content summarizer. Respond with a valid JSON array of strings only. No markdown.' },
      { role: 'user', content: `You are a health content summarizer. The video may be in Hindi or English or mixed.

        Video Title: ${title}
        
        Video Content:
        ${text.slice(0, 6000)}
        
        Summarize into 6-8 clear key health points in simple ENGLISH that any patient can understand.
        If content is in Hindi, translate and summarize in English.
        
        Respond ONLY with a JSON array of strings:
        ["Key point 1", "Key point 2", "Key point 3"]` },    ],
    temperature: 0.3,
    max_tokens: 1000,
  });
  const raw = completion.choices[0]?.message?.content || '[]';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in Groq response');
  return JSON.parse(match[0]);
}

async function generateAISummary(video) {
  if (video.aiSummary?.points?.length && video.aiSummary.generatedAt) {
    const age = Date.now() - new Date(video.aiSummary.generatedAt).getTime();
    if (age < 30 * 24 * 60 * 60 * 1000) return video.aiSummary.points;
  }

  let points = null;

  // Step 1: Get real transcript
  const transcript = await getTranscript(video.youtubeId);

  // Step 2: Groq with transcript (best quality - real video content)
  if (transcript && process.env.GROQ_API_KEY) {
    try { points = await summarizeWithGroq(transcript, video.title); console.log('Groq transcript summary ✓'); }
    catch (e) { console.warn('Groq transcript failed:', e.message); }
  }

  // Step 3: Groq with description (if no transcript)
  if (!points && process.env.GROQ_API_KEY) {
    try { points = await summarizeWithGroq(`${video.title}. ${video.description || ''}`, video.title); console.log('Groq description summary ✓'); }
    catch (e) { console.warn('Groq description failed:', e.message); }
  }

  // Step 4: HuggingFace fallback
  if (!points && process.env.HF_TOKEN) {
    try {
      const { data } = await axios.post('https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
        { inputs: `${video.title}. ${(video.description||'').slice(0,500)}`, parameters: { max_length: 300, min_length: 100 } },
        { headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` }, timeout: 30000 }
      );
      const summary = data[0]?.summary_text || '';
      if (summary) { points = summary.split(/(?<=[.!?])\s+/).filter(s => s.length > 20).slice(0, 7); console.log('HuggingFace summary ✓'); }
    } catch (e) { console.warn('HF failed:', e.message); }
  }

  // Step 5: Local fallback
  if (!points) {
    const topic = video.title.replace(/\|.*$/, '').trim().toLowerCase();
    const sentences = (video.description || '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 40 && !s.match(/^(http|subscribe|follow|like)/i)).slice(0, 5);
    points = [`This video covers ${topic}.`, ...sentences, `Watch the full video for complete details on ${topic}.`].slice(0, 7);
    console.log('Local fallback summary ✓');
  }

  video.aiSummary = { points, generatedAt: new Date() };
  await video.save();
  return points;
}

module.exports = { syncChannelToMongo, searchVideosInMongo, generateAISummary, fetchChannelVideos };
