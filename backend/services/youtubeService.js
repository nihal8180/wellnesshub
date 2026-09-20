
const axios = require("axios");
const Video = require("../models/Video");

const yt = axios.create({
  baseURL: "https://www.googleapis.com/youtube/v3",
  timeout: 30000,
});

// =====================================================
// RESOLVE CHANNEL ID
// =====================================================

async function resolveChannelId(channelId) {
  if (!channelId) {
    throw new Error("YouTube channel ID is required");
  }

  if (!channelId.startsWith("@")) {
    return channelId;
  }

  const { data } = await yt.get("/channels", {
    params: {
      part: "id",
      forHandle: channelId.substring(1),
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  return data.items?.[0]?.id || null;
}

// =====================================================
// FETCH VIDEO DETAILS
// =====================================================

async function fetchVideoDetails(videoIds) {
  if (!videoIds.length) return [];

  const { data } = await yt.get("/videos", {
    params: {
      part: "snippet,contentDetails,statistics",
      id: videoIds.join(","),
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  return data.items.map((video) => ({
    youtubeId: video.id,
    title: video.snippet.title,
    description: video.snippet.description || "",

    thumbnail:
      video.snippet.thumbnails?.high?.url ||
      video.snippet.thumbnails?.medium?.url ||
      video.snippet.thumbnails?.default?.url ||
      "",

    channelTitle: video.snippet.channelTitle || "",
    publishedAt: video.snippet.publishedAt,
    duration: video.contentDetails?.duration || "",

    viewCount: Number(video.statistics?.viewCount || 0),
    tags: video.snippet.tags || [],
  }));
}

// =====================================================
// FETCH MAIN CHANNEL VIDEOS
// =====================================================

async function fetchChannelVideos(channelId, maxResults = 50) {
  const resolvedChannelId = await resolveChannelId(channelId);

  if (!resolvedChannelId) {
    throw new Error("Unable to resolve YouTube channel ID");
  }

  const { data } = await yt.get("/search", {
    params: {
      part: "snippet",
      channelId: resolvedChannelId,
      maxResults: Math.min(maxResults, 50),
      order: "date",
      type: "video",
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  const videoIds = data.items
    .map((item) => item.id?.videoId)
    .filter(Boolean);

  const videos = await fetchVideoDetails(videoIds);

  return videos.map((video) => ({
    ...video,
    playlistType: "main",
  }));
}

// =====================================================
// FETCH HEALTH UPDATE PLAYLIST VIDEOS
// =====================================================

async function fetchPlaylistVideos(
  playlistId,
  maxResults = 50
) {
  if (!playlistId) {
    throw new Error("Health Update playlist ID is required");
  }

  const { data } = await yt.get("/playlistItems", {
    params: {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: Math.min(maxResults, 50),
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  const videoIds = data.items
    .map((item) => item.contentDetails?.videoId)
    .filter(Boolean);

  const videos = await fetchVideoDetails(videoIds);

  return videos.map((video) => ({
    ...video,
    playlistType: "health_update",
  }));
}

// =====================================================
// SAVE VIDEOS TO MONGODB
// =====================================================

async function saveVideosToMongo(videos) {
  let synced = 0;

  for (const video of videos) {
    await Video.findOneAndUpdate(
      { youtubeId: video.youtubeId },
      {
        $set: video,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    synced++;
  }

  return synced;
}

// =====================================================
// SYNC MAIN CHANNEL
// =====================================================

async function syncChannelToMongo(
  channelId,
  maxResults = 50
) {
  const videos = await fetchChannelVideos(
    channelId,
    maxResults
  );

  return saveVideosToMongo(videos);
}

// =====================================================
// SYNC HEALTH UPDATE PLAYLIST
// =====================================================

async function syncHealthUpdatePlaylist(
  playlistId,
  maxResults = 50
) {
  const videos = await fetchPlaylistVideos(
    playlistId,
    maxResults
  );

  return saveVideosToMongo(videos);
}

// =====================================================
// SEARCH VIDEOS
// =====================================================

async function searchVideosInMongo(query) {
  return Video.find(
    {
      $text: { $search: query },
      published: true,
    },
    {
      score: { $meta: "textScore" },
    }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(20);
}

// =====================================================
// GET YOUTUBE TRANSCRIPT
// =====================================================

async function getTranscript(youtubeId) {
  try {
    const { YoutubeTranscript } = require("youtube-transcript");

    const transcript =
      await YoutubeTranscript.fetchTranscript(youtubeId);

    return transcript
      .map((item) => item.text)
      .join(" ")
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch (error) {
    console.warn(
      "Transcript unavailable:",
      error.message
    );

    return null;
  }
}

// =====================================================
// GROQ AI SUMMARY
// =====================================================

async function summarizeWithGroq(text, title) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const Groq = require("groq-sdk");

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const language =
    process.env.AI_SUMMARY_LANGUAGE || "Hindi";

  const completion =
    await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content:
            "You are a reliable health content summarizer. " +
            "Do not invent medical facts. Return only a valid JSON array of strings.",
        },

        {
          role: "user",
          content: `
Video Title: ${title}

Video Content:
${text.slice(0, 6000)}

Create 6-8 clear health-related key points in ${language}.

Rules:
- Use simple language understandable by common people.
- Do not provide a personal diagnosis.
- Do not invent information absent from the content.
- Mention when viewers should consult a qualified healthcare professional.
- Return ONLY a JSON array of strings.

Example:
["पहला मुख्य बिंदु", "दूसरा मुख्य बिंदु"]
`,
        },
      ],

      temperature: 0.3,
      max_tokens: 1200,
    });

  const raw =
    completion.choices[0]?.message?.content || "[]";

  const match = raw.match(/\[[\s\S]*\]/);

  if (!match) {
    throw new Error("No valid JSON array in Groq response");
  }

  const parsed = JSON.parse(match[0]);

  if (!Array.isArray(parsed)) {
    throw new Error("Groq response is not an array");
  }

  return parsed
    .filter((point) => typeof point === "string")
    .slice(0, 8);
}

// =====================================================
// GENERATE AI SUMMARY WITH CACHE
// =====================================================

async function generateAISummary(video) {
  if (
    video.aiSummary?.points?.length &&
    video.aiSummary.generatedAt
  ) {
    const age =
      Date.now() -
      new Date(video.aiSummary.generatedAt).getTime();

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (age < thirtyDays) {
      return video.aiSummary.points;
    }
  }

  let points = null;

  // 1. Try transcript
  const transcript = await getTranscript(
    video.youtubeId
  );

  if (transcript && process.env.GROQ_API_KEY) {
    try {
      points = await summarizeWithGroq(
        transcript,
        video.title
      );

      console.log("Groq transcript summary generated");
    } catch (error) {
      console.warn(
        "Transcript summary failed:",
        error.message
      );
    }
  }

  // 2. Try title and description
  if (!points && process.env.GROQ_API_KEY) {
    try {
      const content = `${video.title}. ${
        video.description || ""
      }`;

      points = await summarizeWithGroq(
        content,
        video.title
      );

      console.log("Groq description summary generated");
    } catch (error) {
      console.warn(
        "Description summary failed:",
        error.message
      );
    }
  }

  // 3. Local fallback
  if (!points) {
    const topic = video.title
      .replace(/\|.*$/, "")
      .trim();

    const sentences = (video.description || "")
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter(
        (sentence) =>
          sentence.length > 40 &&
          !/^(http|subscribe|follow|like)/i.test(
            sentence
          )
      )
      .slice(0, 5);

    points = [
      `यह वीडियो ${topic} के बारे में है।`,
      ...sentences,
      `पूरी जानकारी के लिए पूरा वीडियो देखें।`,
    ].slice(0, 7);

    console.log("Local fallback summary generated");
  }

  video.aiSummary = {
    points,
    generatedAt: new Date(),
  };

  await video.save();

  return points;
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

module.exports = {
  syncChannelToMongo,
  syncHealthUpdatePlaylist,
  searchVideosInMongo,
  generateAISummary,
  fetchChannelVideos,
  fetchPlaylistVideos,
};