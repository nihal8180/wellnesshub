# WellnessHub — Health Awareness Platform

Full-stack: React frontend + Node.js/Express backend + MongoDB Atlas.

## Project Structure

```
wellnesshub/
├── backend/
│   ├── server.js               ← Entry point
│   ├── .env.example            ← Copy to .env and fill values
│   ├── config/db.js            ← MongoDB connection
│   ├── middleware/auth.js      ← JWT protect + adminOnly
│   ├── models/
│   │   ├── Video.js            ← YouTube video + AI summary cache
│   │   ├── Article.js          ← Health articles (CRUD)
│   │   ├── User.js             ← Admin/editor users
│   │   └── Settings.js        ← Channel ID, site config
│   ├── routes/
│   │   ├── auth.js             ← POST /login, GET /me
│   │   ├── videos.js           ← Search, sync, CRUD
│   │   ├── articles.js         ← Public + admin article CRUD
│   │   ├── admin.js            ← Stats, user management
│   │   └── settings.js        ← Key-value settings
│   ├── services/
│   │   └── youtubeService.js  ← YouTube sync + Claude AI summaries
│   └── scripts/seed.js        ← Create first admin user
└── README.md
```

## Quick Start

### 1. MongoDB Atlas (free)
1. Sign up at https://cloud.mongodb.com
2. Create a free M0 cluster
3. Add a database user and whitelist your IP (or 0.0.0.0/0 for dev)
4. Copy the connection string

### 2. YouTube API Key
1. Go to https://console.cloud.google.com
2. Create a project → Enable "YouTube Data API v3"
3. Credentials → Create API Key

### 3. Anthropic Key
1. Sign up at https://console.anthropic.com
2. API Keys → Create key

### 4. Run the backend

```bash
cd backend
cp .env.example .env
# Fill in all values in .env

npm install
npm run seed       # creates your first admin user
npm run dev        # starts on http://localhost:5000
```

### 5. Test the API

```bash
# Health check
curl http://localhost:5000/api/health

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wellnesshub.com","password":"your_password"}'

# Sync YouTube videos (requires token)
curl -X POST http://localhost:5000/api/videos/sync \
  -H "Authorization: Bearer <token>"

# Search videos (public)
curl "http://localhost:5000/api/videos?q=diabetes"

# Get AI summary for a video
curl "http://localhost:5000/api/videos/<videoId>/summary"

# Create article (requires token)
curl -X POST http://localhost:5000/api/articles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"10 Heart Health Tips","excerpt":"Short preview...","content":"Full body...","category":"Heart Health","published":true}'
```

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | — | Admin login |
| GET | /api/auth/me | ✓ | Current user |
| GET | /api/videos | — | List/search videos |
| GET | /api/videos/:id/summary | — | AI summary (cached) |
| POST | /api/videos/sync | Admin | Sync from YouTube |
| PATCH | /api/videos/:id | Admin | Update video fields |
| DELETE | /api/videos/:id | Admin | Remove video |
| GET | /api/articles | — | List published articles |
| GET | /api/articles/:slug | — | Read full article |
| GET | /api/articles/admin/all | ✓ | All including drafts |
| POST | /api/articles | ✓ | Create article |
| PUT | /api/articles/:id | ✓ | Full update |
| PATCH | /api/articles/:id | ✓ | Toggle published/featured |
| DELETE | /api/articles/:id | Admin | Delete article |
| GET | /api/admin/stats | Admin | Dashboard stats |
| POST | /api/admin/sync-youtube | Admin | Manual YouTube sync |
| GET | /api/settings/:key | — | Get a setting |
| PUT | /api/settings/:key | Admin | Update a setting |

## Deploying to Railway (recommended)

1. Push to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add all environment variables from .env
4. Done — Railway gives you a public URL

## Key Features

- **Video sync**: Admin clicks "Sync" → pulls all videos from YouTube channel into MongoDB
- **AI summaries**: Generated once per video, cached in DB forever (refreshed after 30 days)
- **Articles**: Full CRUD — create, edit, publish/unpublish, feature, delete
- **Admin panel**: Password-protected JWT login, role-based (admin vs editor)
- **Text search**: MongoDB full-text search across video titles, descriptions, and tags
- **Settings**: Channel ID stored in DB, changeable from admin without redeployment
