// server.js
// Entry point for the minimal-blog API server.
// ──────────────────────────────────────────────────────────────

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const publicRoutes = require('./routes/public');
const adminRoutes  = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ─────────────────────────────────────────────
app.use(express.json());

app.use(
  cors({
    origin: [
      process.env.FRONTEND_ORIGIN,
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://localhost:3000',
    ].filter(Boolean),
    credentials: true,
  })
);

// Trust proxy so req.ip resolves correctly behind reverse proxies
app.set('trust proxy', true);

// ─── Static: Admin Dashboard ────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// ─── Routes ────────────────────────────────────────────────
app.use('/api',       publicRoutes);
app.use('/api/admin', adminRoutes);

// ─── Global error handler ──────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✦  Blog API listening on http://localhost:${PORT}`);
});
