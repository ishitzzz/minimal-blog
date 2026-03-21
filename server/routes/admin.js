// routes/admin.js
// Protected admin endpoints.
// ──────────────────────────────────────────────────────────────

const { Router } = require('express');
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const sharp      = require('sharp');

const auth                       = require('../middleware/auth');
const { supabase, uploadImage }  = require('../services/supabase');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ═══════════════════════════════════════════════════════════
// LOGIN — no auth required (must be defined BEFORE the
//         router.use(auth) call below)
// ═══════════════════════════════════════════════════════════

router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);
  const received = Buffer.from(password);

  const valid =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { sub: 'owner' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token });
});

// ═══════════════════════════════════════════════════════════
// All routes below this line require a valid JWT
// ═══════════════════════════════════════════════════════════
router.use(auth);

// ─── Helpers ───────────────────────────────────────────────

/** Turn a title into a URL-safe slug. */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Ensure the slug is unique; append a short timestamp suffix if not. */
async function ensureUniqueSlug(slug) {
  const { data } = await supabase
    .from('posts')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (data && data.length > 0) {
    return `${slug}-${Date.now().toString(36)}`;
  }
  return slug;
}

// ─── GET /api/admin/posts ──────────────────────────────────
// All posts (published + draft) with per-post view counts.
router.get('/posts', async (req, res, next) => {
  try {
    // 1. Fetch all posts
    const { data: posts, error: pErr } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (pErr) throw pErr;

    // 2. Fetch view counts grouped by page_slug
    const { data: views, error: vErr } = await supabase
      .from('analytics_events')
      .select('page_slug')
      .eq('event_type', 'page_view');

    if (vErr) throw vErr;

    // Aggregate counts in JS
    const viewMap = {};
    for (const row of views) {
      viewMap[row.page_slug] = (viewMap[row.page_slug] || 0) + 1;
    }

    // 3. Merge
    const result = posts.map((post) => ({
      ...post,
      view_count: viewMap[post.slug] || 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/posts ─────────────────────────────────
router.post('/posts', async (req, res, next) => {
  try {
    const { title, date, excerpt, body, polaroids, glass_config } = req.body;

    let slug = slugify(title);
    slug = await ensureUniqueSlug(slug);

    const { data, error } = await supabase
      .from('posts')
      .insert({
        slug,
        title,
        date,
        excerpt,
        body,
        polaroids: polaroids || [],
        glass_config: glass_config || {},
        published: false,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/posts/:id ────────────────────────────
router.patch('/posts/:id', async (req, res, next) => {
  try {
    const allowed = ['title', 'date', 'excerpt', 'body', 'polaroids', 'glass_config'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/posts/:id/publish ────────────────────
router.patch('/posts/:id/publish', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({ published: true })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/posts/:id/unpublish ──────────────────
router.patch('/posts/:id/unpublish', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({ published: false })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/posts/:id ───────────────────────────
router.delete('/posts/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/images ─────────────────────────────────
router.get('/images', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/upload ────────────────────────────────
// Multipart file upload → Supabase Storage + images table row.
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate MIME type
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'File must be an image' });
    }

    // Read dimensions with sharp
    const metadata = await sharp(req.file.buffer).metadata();
    const width  = metadata.width;
    const height = metadata.height;

    // Upload to Supabase Storage
    const url = await uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Insert row into images table
    const alt = req.body.alt || null;

    const { data, error } = await supabase
      .from('images')
      .insert({
        filename: req.file.originalname,
        url,
        alt,
        width,
        height,
      })
      .select('id, url, width, height')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/analytics/overview ─────────────────────
router.get('/analytics/overview', async (req, res, next) => {
  try {
    // Total sessions
    const { count: totalSessions, error: e1 } = await supabase
      .from('analytics_sessions')
      .select('*', { count: 'exact', head: true });
    if (e1) throw e1;

    // Total page_view events
    const { count: totalPageViews, error: e2 } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'page_view');
    if (e2) throw e2;

    // Total story_read events
    const { count: totalStoryReads, error: e3 } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'story_read');
    if (e3) throw e3;

    // Top 5 posts by page_view count
    const { data: pvEvents, error: e4 } = await supabase
      .from('analytics_events')
      .select('page_slug')
      .eq('event_type', 'page_view');
    if (e4) throw e4;

    const slugCounts = {};
    for (const { page_slug } of pvEvents) {
      if (page_slug) slugCounts[page_slug] = (slugCounts[page_slug] || 0) + 1;
    }
    const topPosts = Object.entries(slugCounts)
      .map(([page_slug, count]) => ({ page_slug, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top 5 referrers (exclude null / empty)
    const { data: sessions, error: e5 } = await supabase
      .from('analytics_sessions')
      .select('referrer')
      .not('referrer', 'is', null)
      .neq('referrer', '');
    if (e5) throw e5;

    const refCounts = {};
    for (const { referrer } of sessions) {
      refCounts[referrer] = (refCounts[referrer] || 0) + 1;
    }
    const topReferrers = Object.entries(refCounts)
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Distinct countries in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSessions, error: e6 } = await supabase
      .from('analytics_sessions')
      .select('country_code')
      .gte('first_seen', sevenDaysAgo)
      .not('country_code', 'is', null);
    if (e6) throw e6;

    const countryCounts = {};
    for (const { country_code } of recentSessions) {
      countryCounts[country_code] = (countryCounts[country_code] || 0) + 1;
    }
    const recentCountries = Object.entries(countryCounts)
      .map(([country_code, count]) => ({ country_code, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      total_sessions: totalSessions,
      total_page_views: totalPageViews,
      total_story_reads: totalStoryReads,
      top_posts: topPosts,
      top_referrers: topReferrers,
      recent_countries: recentCountries,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/analytics/sessions ─────────────────────
// 50 most recent sessions with event counts.
router.get('/analytics/sessions', async (req, res, next) => {
  try {
    // 1. Fetch latest 50 sessions
    const { data: sessions, error: sErr } = await supabase
      .from('analytics_sessions')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(50);

    if (sErr) throw sErr;

    if (sessions.length === 0) {
      return res.json([]);
    }

    // 2. Fetch event counts for those session IDs
    const sessionIds = sessions.map((s) => s.id);
    const { data: events, error: eErr } = await supabase
      .from('analytics_events')
      .select('session_id')
      .in('session_id', sessionIds);

    if (eErr) throw eErr;

    const countMap = {};
    for (const { session_id } of events) {
      countMap[session_id] = (countMap[session_id] || 0) + 1;
    }

    // 3. Merge
    const result = sessions.map((s) => ({
      ...s,
      event_count: countMap[s.id] || 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
