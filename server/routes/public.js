// routes/public.js
// Public endpoints — no auth required.
// ──────────────────────────────────────────────────────────────

const { Router }       = require('express');
const { supabase }     = require('../services/supabase');
const { getGeoFromIp, hashIp } = require('../services/geo');

const router = Router();

// ─── GET /api/posts ────────────────────────────────────────
// List published posts (card-preview fields only).
router.get('/posts', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, slug, title, date, excerpt, glass_config')
      .eq('published', true)
      .order('date', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/posts/:slug ──────────────────────────────────
// Single published post (all fields).
router.get('/posts/:slug', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('published', true)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/track ───────────────────────────────────────
// Analytics ingestion — responds immediately, does async work after.
router.post('/track', (req, res) => {
  // Respond right away so the client is never blocked
  res.json({ ok: true });

  // Fire-and-forget async processing
  (async () => {
    try {
      const {
        event_type,
        page_slug,
        metadata = {},
        referrer = null,
        user_agent = null,
      } = req.body;

      // ── Resolve real IP ──────────────────────────────────
      const rawIp =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip ||
        '0.0.0.0';

      const ip_hash = hashIp(rawIp);
      const geo     = getGeoFromIp(rawIp);

      // ── Upsert session ──────────────────────────────────
      // Look for an existing session from this ip_hash within the last 30 min
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const { data: existing } = await supabase
        .from('analytics_sessions')
        .select('*')
        .eq('ip_hash', ip_hash)
        .gte('last_seen', thirtyMinAgo)
        .order('last_seen', { ascending: false })
        .limit(1)
        .single();

      let sessionId;

      if (existing) {
        // Update existing session
        const updatedPages = [...(existing.pages_visited || [])];
        if (page_slug && !updatedPages.includes(page_slug)) {
          updatedPages.push(page_slug);
        }

        await supabase
          .from('analytics_sessions')
          .update({
            last_seen: new Date().toISOString(),
            visit_count: existing.visit_count + 1,
            pages_visited: updatedPages,
          })
          .eq('id', existing.id);

        sessionId = existing.id;
      } else {
        // Create new session
        const { data: newSession, error: sessErr } = await supabase
          .from('analytics_sessions')
          .insert({
            ip_hash,
            country_code: geo.country_code,
            city: geo.city,
            user_agent: user_agent || req.headers['user-agent'] || null,
            referrer,
            pages_visited: page_slug ? [page_slug] : [],
          })
          .select('id')
          .single();

        if (sessErr) throw sessErr;
        sessionId = newSession.id;
      }

      // ── Insert event ────────────────────────────────────
      await supabase.from('analytics_events').insert({
        session_id: sessionId,
        event_type,
        page_slug,
        metadata,
      });
    } catch (err) {
      // Analytics failures are silently logged — never surface to the user
      console.error('[analytics]', err.message || err);
    }
  })();
});

// ─── GET /api/health ───────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

module.exports = router;
