// =========================================================================
//  TRACKER.JS — Fire-and-forget analytics client
//  Sends events to the API without ever blocking page load or interaction.
// =========================================================================
(function () {
  const API_BASE = window.API_BASE || 'http://localhost:4000';

  // ── Session ID ──────────────────────────────────────────
  let sessionId = sessionStorage.getItem('tactile_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('tactile_session_id', sessionId);
  }

  // ── Helpers ─────────────────────────────────────────────
  function getPageSlug() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (slug) return slug;
    // Derive from pathname (strip leading/trailing slashes, default to 'home')
    const path = window.location.pathname.replace(/^\/|\/$/g, '').replace(/\.html$/, '');
    return path || 'home';
  }

  function sendEvent(eventType, extra = {}) {
    try {
      fetch(`${API_BASE}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          event_type: eventType,
          page_slug: getPageSlug(),
          metadata: extra.metadata || {},
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null,
        }),
      }).catch(() => { /* swallow */ });
    } catch (_) { /* swallow */ }
  }

  // ── 1. Page View ────────────────────────────────────────
  sendEvent('page_view');

  // ── 2. Scroll Depth Milestones ──────────────────────────
  const milestonesFired = new Set();

  function checkScrollDepth() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.body.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;

    const pct = Math.round((scrollTop / docHeight) * 100);

    [25, 50, 75, 100].forEach((milestone) => {
      if (pct >= milestone && !milestonesFired.has(milestone)) {
        milestonesFired.add(milestone);
        sendEvent('scroll_depth', { metadata: { scroll_pct: milestone } });
      }
    });
  }

  window.addEventListener('scroll', checkScrollDepth, { passive: true });

  // ── 3. Story Read (30 s on a story page) ────────────────
  const isStoryPage =
    window.location.pathname.includes('story') ||
    new URLSearchParams(window.location.search).has('slug');

  if (isStoryPage) {
    setTimeout(() => {
      sendEvent('story_read');
    }, 30000);
  }

  // ── 4. Card Click ───────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="read-story"]');
    if (!btn) return;

    const card = btn.closest('.post');
    if (!card) return;

    sendEvent('card_click', {
      metadata: {
        card_index: parseInt(card.dataset.cardIndex, 10),
        story: card.dataset.story,
      },
    });
  });

  // ── 5. Polaroid Click ───────────────────────────────────
  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.polaroid-wrapper');
    if (!wrapper) return;

    sendEvent('polaroid_click', {
      metadata: {
        title: wrapper.dataset.title || null,
      },
    });
  });

  // ── 6. Back Navigate ───────────────────────────────────
  document.addEventListener('click', (e) => {
    const backBtn = e.target.closest('#back-btn');
    if (!backBtn) return;

    sendEvent('back_navigate');
  });
})();
