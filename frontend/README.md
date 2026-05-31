# WellnessHub Frontend

Two HTML files — no build step required.

## Files

| File | URL | Description |
|------|-----|-------------|
| `public/index.html` | `/` | Public-facing website (hero, video search, articles) |
| `admin/index.html` | `/admin/` | Password-protected admin dashboard |

## Connecting to your backend

Both files have this line at the top of their `<script>` block:

```js
const API = (window.BACKEND_URL || 'http://localhost:5000') + '/api';
```

For production, set `window.BACKEND_URL` before the script runs by adding this to your HTML (or inject it via your hosting platform):

```html
<script>window.BACKEND_URL = 'https://your-backend.railway.app';</script>
```

Or just find & replace `http://localhost:5000` with your deployed backend URL.

## Deploy options

### Option A — Same server as Express (simplest)
In your Express `server.js`, add:
```js
const path = require('path');
// Serve public site
app.use(express.static(path.join(__dirname, '../frontend/public')));
// Serve admin
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));
```

### Option B — Separate static host (Vercel / Netlify / GitHub Pages)
1. Upload `public/index.html` to Vercel as a static site
2. Upload `admin/index.html` to a separate Vercel project (or a `/admin` path)
3. Set `window.BACKEND_URL` to your Railway backend URL

### Option C — Nginx
```nginx
server {
  root /var/www/wellnesshub;
  location /admin/ { try_files $uri $uri/ /admin/index.html; }
  location /      { try_files $uri $uri/ /index.html; }
}
```

## Admin features

- **Login** — JWT auth, token stored in localStorage
- **Dashboard** — live stats: total videos, articles, views
- **Videos tab** — search, filter by category/status, feature/hide/delete each video, sync from YouTube
- **Articles tab** — full CRUD editor with title, excerpt, body (HTML), cover image, category, tags, publish toggle, feature toggle
- **Settings** — update YouTube channel ID and site title (stored in MongoDB)

## Security notes

- The admin panel is **client-side only** — its security comes entirely from your backend JWT.
- For production, consider putting `/admin/` behind HTTP Basic Auth at the server/CDN level as an extra layer.
- Never commit your `.env` file.
