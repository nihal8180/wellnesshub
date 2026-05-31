require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/videos',   require('./routes/videos'));
app.use('/api/articles', require('./routes/articles'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`WellnessHub API running on port ${PORT}`));

if (process.env.RUN_SEED === 'true') {
  const User = require('./models/User');
  mongoose = require('mongoose');
  const waitForDB = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      clearInterval(waitForDB);
      try {
        const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
        if (!existing) {
          await User.create({
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD,
            name: 'Admin',
            role: 'admin',
          });
          console.log('Admin user created on production!');
        } else {
          console.log('Admin already exists');
        }
      } catch(e) {
        console.log('Seed error:', e.message);
      }
    }
  }, 1000);
}
if (process.env.RESET_ADMIN === 'true') {
  const User = require('./models/User');
  const mongoose = require('mongoose');
  const waitForDB = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      clearInterval(waitForDB);
      await User.deleteOne({ email: process.env.ADMIN_EMAIL });
      await User.create({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        name: 'Admin',
        role: 'admin',
      });
      console.log('Admin user reset on production!');
    }
  }, 1000);
}