// =========================================================================
//  TACTILE BLOG — 4-Layer Liquid Glass Optics Engine
//  Architecture: SVG Refraction + CSS Claymorphism + GSAP Spring Physics
//  Performance: RAF-throttled updates, selective filtering, compositor-first
// =========================================================================

// =========================================================================
//  0. RETURNING FROM STORY — Instant full-screen glass overlay
//     If returning from story page, create a glass overlay covering the
//     ENTIRE viewport immediately. The user sees only glass from frame 1.
//     The actual shrink animation happens after ScrollTrigger is ready.
// =========================================================================
const _isReturning = sessionStorage.getItem('returning-from-story');
const _returnCardIndex = sessionStorage.getItem('expanding-card-index');
let _returnOverlay = null;

if (_isReturning && _returnCardIndex !== null) {
    sessionStorage.removeItem('returning-from-story');
    sessionStorage.removeItem('expanding-card-index');

    // Create full-screen glass overlay covering everything.
    // Uses backdrop-filter for the frosted glass look from frame 1.
    _returnOverlay = document.createElement('div');
    _returnOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        backdrop-filter: blur(var(--blur-radius, 8px)) saturate(var(--blur-vibrancy, 150%));
        -webkit-backdrop-filter: blur(var(--blur-radius, 8px)) saturate(var(--blur-vibrancy, 150%));
        background: rgba(255, 255, 255, 0.03);
        pointer-events: none;
    `;
    document.body.appendChild(_returnOverlay);
}

// Initialize Lucide Icons
lucide.createIcons();

// =========================================================================
//  1. SMOOTH SCROLLING (Lenis)
// =========================================================================
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
});

// =========================================================================
//  2. CARD STACK CONFIGURATION
// =========================================================================
const cards = document.querySelectorAll('.post');
const totalCards = cards.length;

const yOffset = 50;
const scaleOffset = 0.08;
const blurMultiplier = 10;

// =========================================================================
//  PERFORMANCE: Pre-cache everything to avoid DOM queries in hot loops
// =========================================================================
const cardInnerElements = new Map();
const cardFloatMasses = new Map();

cards.forEach(card => {
    const els = card.querySelectorAll('.date, h2, .excerpt, .btn-standard');
    cardInnerElements.set(card, els);
    const masses = [];
    els.forEach(el => {
        masses.push(parseFloat(getComputedStyle(el).getPropertyValue('--float-mass')) || 0.2);
    });
    cardFloatMasses.set(card, masses);
});

let viewH = window.innerHeight;
let viewW = window.innerWidth;

// =========================================================================
//  3. DYNAMIC LIGHTING — Lerp-smoothed, RAF-throttled
//     Mouse position is accumulated and applied once per frame via lerp
// =========================================================================
const root = document.documentElement;
let mouseTarget = { x: 50, y: 50 };
let mouseCurrent = { x: 50, y: 50 };
const MOUSE_LERP = 0.1;

window.addEventListener('mousemove', (e) => {
    mouseTarget.x = (e.clientX / viewW) * 100;
    mouseTarget.y = (e.clientY / viewH) * 100;
}, { passive: true });

function tickMouse() {
    const dx = mouseTarget.x - mouseCurrent.x;
    const dy = mouseTarget.y - mouseCurrent.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;

    mouseCurrent.x += dx * MOUSE_LERP;
    mouseCurrent.y += dy * MOUSE_LERP;

    // CROSS-BROWSER OPTIMIZATION: Pre-compute light/shadow offsets in JS.
    // This eliminates 4 CSS calc() evaluations per frame that cause lag
    // on Safari, Firefox, and Brave. The browser just applies final values.
    const lightX = ((50 - mouseCurrent.x) / 50) * 8;
    const lightY = ((50 - mouseCurrent.y) / 50) * 8;
    const shadowX = ((mouseCurrent.x - 50) / 50) * 8;
    const shadowY = ((mouseCurrent.y - 50) / 50) * 8;

    root.style.setProperty('--light-x', `${lightX}px`);
    root.style.setProperty('--light-y', `${lightY}px`);
    root.style.setProperty('--shadow-x', `${shadowX}px`);
    root.style.setProperty('--shadow-y', `${shadowY}px`);

    // Pre-compute drop shadow offsets (eliminates remaining calc() in .glassy-effect)
    root.style.setProperty('--drop-x', `${shadowX * 2}px`);
    root.style.setProperty('--drop-y', `${20 + shadowY * 2}px`);

    // Pure numbers for backwards compatibility + pre-computed percentages for gradient
    root.style.setProperty('--mouse-x', mouseCurrent.x);
    root.style.setProperty('--mouse-y', mouseCurrent.y);
    root.style.setProperty('--mouse-x-pct', `${mouseCurrent.x}%`);
    root.style.setProperty('--mouse-y-pct', `${mouseCurrent.y}%`);
}

// =========================================================================
//  4. SVG REFRACTION — Synced once on load (expensive, don't call per-frame)
// =========================================================================
const svgDisp = document.getElementById('svg-disp');
const svgTurb = document.getElementById('svg-turb');

(function syncSVGFilter() {
    const styles = getComputedStyle(root);
    const warp = parseFloat(styles.getPropertyValue('--refraction-warp')) || 150;
    const oiliness = parseFloat(styles.getPropertyValue('--liquid-oiliness')) || 30;
    if (svgDisp) svgDisp.setAttribute('scale', warp);
    if (svgTurb) {
        const base = oiliness * 0.0001;
        svgTurb.setAttribute('baseFrequency', `${base} ${base * 2.33}`);
    }
})();

// =========================================================================
//  5. SVG FILTER PERFORMANCE MANAGEMENT
//     feTurbulence is CPU-computed and catastrophically expensive.
//     Strategy: Only apply SVG filter to the ACTIVE card, and disable during scroll.
// =========================================================================
let isScrolling = false;
let scrollTimer = null;
let lastActiveCardForFilter = null;
let filterReenableRAF = null;

function enableSVGFilter(card) {
    if (lastActiveCardForFilter === card) return;
    // Remove from previous
    if (lastActiveCardForFilter) {
        const bend = lastActiveCardForFilter.querySelector('.glass-bend');
        if (bend) bend.style.filter = 'none';
    }
    // Apply to new active card (only when not scrolling)
    if (!isScrolling && card) {
        const bend = card.querySelector('.glass-bend');
        if (bend) bend.style.filter = '';  // revert to CSS default (url(#glass-blur))
    }
    lastActiveCardForFilter = card;
}

function disableAllSVGFilters() {
    cards.forEach(card => {
        const bend = card.querySelector('.glass-bend');
        if (bend) bend.style.filter = 'none';
    });
}

function onScrollStart() {
    if (!isScrolling) {
        isScrolling = true;
        disableAllSVGFilters();  // Kill SVG filter during scroll for smooth 60fps
        // Add scroll class to all cards for CSS-based effect reduction
        cards.forEach(c => c.classList.add('is-scrolling'));
        // Cancel any pending re-enable
        if (filterReenableRAF) cancelAnimationFrame(filterReenableRAF);
    }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        isScrolling = false;
        cards.forEach(c => c.classList.remove('is-scrolling'));
        // Use RAF for synchronized re-enable (smoother than raw setTimeout)
        filterReenableRAF = requestAnimationFrame(() => {
            if (lastActiveCardForFilter) {
                enableSVGFilter(lastActiveCardForFilter);
            }
        });
    }, 200);
}

// =========================================================================
//  6. OIL FLOAT PARALLAX (cached, no getComputedStyle in hot path)
// =========================================================================
function updateOilFloat(card, segmentProgress, isPeelingAway) {
    const els = cardInnerElements.get(card);
    const masses = cardFloatMasses.get(card);
    if (!els || !masses) return;

    for (let i = 0; i < els.length; i++) {
        if (isPeelingAway) {
            const m = masses[i];
            gsap.set(els[i], {
                y: -(segmentProgress * m * 40),
                x: segmentProgress * m * -8,
                opacity: gsap.utils.interpolate(1, 0, segmentProgress * (1 + m)),
                force3D: true
            });
        } else {
            gsap.set(els[i], { y: 0, x: 0, opacity: 1, force3D: true });
        }
    }
}

// =========================================================================
//  7. ROTARY DIAL PAGINATION
// =========================================================================
const dialContainer = document.createElement('div');
dialContainer.className = 'card-dial';

const upArrow = document.createElement('div');
upArrow.className = 'dial-arrow';
upArrow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
dialContainer.appendChild(upArrow);

const dialWindow = document.createElement('div');
dialWindow.className = 'dial-window';
const dialTrack = document.createElement('div');
dialTrack.className = 'dial-track';
dialWindow.appendChild(dialTrack);
dialContainer.appendChild(dialWindow);

const downArrow = document.createElement('div');
downArrow.className = 'dial-arrow';
downArrow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
dialContainer.appendChild(downArrow);

cards.forEach((card, index) => {
    card.style.zIndex = totalCards - index;
    const dot = document.createElement('div');
    dot.className = 'dial-dot';
    dialTrack.appendChild(dot);
});

document.querySelector('.sticky-card-section').appendChild(dialContainer);
const dots = document.querySelectorAll('.dial-dot');

// =========================================================================
//  8. RENDER STACK — Core animation loop
//     Dirty-tracking prevents redundant style mutations
// =========================================================================
const lastBlur = new Map();

function renderStack(virtualProgress) {
    let activeIndex = Math.floor(virtualProgress);
    activeIndex = Math.min(activeIndex, totalCards - 1);
    const segmentProgress = virtualProgress - activeIndex;

    cards.forEach((card, index) => {
        if (index < activeIndex) {
            // PAST: off-screen
            gsap.set(card, {
                y: -viewH * 1.5, rotationX: 75, scale: 1, opacity: 0, force3D: true
            });
            if (lastBlur.get(index) !== 0) {
                card.style.filter = ''; lastBlur.set(index, 0);
            }
            updateOilFloat(card, 1, true);
        }
        else if (index === activeIndex) {
            // ACTIVE: peeling off
            const eased = gsap.parseEase("power2.in")(segmentProgress);
            const opEase = gsap.parseEase("power3.out")(segmentProgress);
            gsap.set(card, {
                y: gsap.utils.interpolate(0, -viewH * 1.5, eased),
                rotationX: gsap.utils.interpolate(0, 75, eased),
                scale: 1,
                opacity: gsap.utils.interpolate(1, 0, opEase),
                force3D: true
            });
            if (lastBlur.get(index) !== 0) {
                card.style.filter = ''; lastBlur.set(index, 0);
            }
            updateOilFloat(card, segmentProgress, true);
            enableSVGFilter(card);
        }
        else {
            // STACKED: behind active
            const behind = index - activeIndex;
            const off = behind - segmentProgress;
            gsap.set(card, {
                y: off * yOffset,
                rotationX: 0,
                scale: 1 - (off * scaleOffset),
                opacity: 1,
                force3D: true
            });

            const blur = behind <= 2
                ? Math.round(gsap.utils.clamp(0, 20, off * blurMultiplier))
                : 20;

            if (lastBlur.get(index) !== blur) {
                card.style.filter = blur > 0 ? `blur(${blur}px)` : '';
                lastBlur.set(index, blur);
            }
            updateOilFloat(card, 0, false);
        }
    });

    // Dial pagination
    gsap.set(dialTrack, { y: -virtualProgress * 30 });
    dots.forEach((dot, i) => {
        const dist = Math.abs(i - virtualProgress);
        let s = 0, o = 0;
        if (dist < 0.1) { s = 1.3; o = 1; }
        else if (dist <= 1.5) {
            s = gsap.utils.mapRange(0.1, 1.5, 1.0, 0.4, dist);
            o = gsap.utils.mapRange(0.1, 1.5, 0.7, 0.1, dist);
        }
        gsap.to(dot, { scale: s, opacity: o, duration: 0.2, overwrite: "auto" });
    });
}

renderStack(0);

// =========================================================================
//  9. SCROLL-DRIVEN ANIMATION
// =========================================================================
let st = ScrollTrigger.create({
    trigger: '.sticky-card-section',
    start: 'top top',
    end: () => `+=${viewH * 0.4 * totalCards}`,
    pin: true,
    scrub: 0.5,
    snap: {
        snapTo: 1 / (totalCards - 1),
        duration: { min: 0.3, max: 0.7 },
        delay: 0.05,
        ease: "elastic.out(1, 0.4)"
    },
    onUpdate: (self) => {
        onScrollStart();
        renderStack(self.progress * (totalCards - 1));
    }
});

// =========================================================================
//  9b. REVERSE ANIMATION — Scale-based shrink from viewport to card
// =========================================================================
if (_returnOverlay && _returnCardIndex !== null) {
    const targetIdx = parseInt(_returnCardIndex);

    // Scroll to the correct card position instantly (overlay covers everything)
    const targetProgress = targetIdx / (totalCards - 1);
    const scrollPos = st.start + targetProgress * (st.end - st.start);
    window.scrollTo(0, scrollPos);
    lenis.stop();

    // Force the card stack to render at this card
    renderStack(targetIdx);

    // Wait 2 frames for layout to settle
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const targetCard = cards[targetIdx];
            if (!targetCard) { _returnOverlay.remove(); lenis.start(); return; }

            const rect = targetCard.getBoundingClientRect();
            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            const vpCenterX = viewW / 2;
            const vpCenterY = viewH / 2;

            // Reshape overlay from full-screen to card-sized
            _returnOverlay.style.inset = 'auto';
            _returnOverlay.style.top = rect.top + 'px';
            _returnOverlay.style.left = rect.left + 'px';
            _returnOverlay.style.width = rect.width + 'px';
            _returnOverlay.style.height = rect.height + 'px';
            _returnOverlay.style.borderRadius = 'var(--glass-radius)';
            _returnOverlay.style.transformOrigin = 'center center';

            // Scale so it still covers the viewport
            const scaleX = viewW / rect.width;
            const scaleY = viewH / rect.height;
            const startScale = Math.max(scaleX, scaleY) * 1.05;
            const translateX = vpCenterX - cardCenterX;
            const translateY = vpCenterY - cardCenterY;

            gsap.set(_returnOverlay, {
                scale: startScale,
                x: translateX,
                y: translateY,
            });

            // Shrink from viewport to card position
            gsap.to(_returnOverlay, {
                scale: 1,
                x: 0,
                y: 0,
                duration: 0.9,
                ease: 'power3.inOut',
                force3D: true,
                onComplete: () => {
                    gsap.to(_returnOverlay, {
                        opacity: 0,
                        duration: 0.3,
                        ease: 'power2.out',
                        onComplete: () => {
                            _returnOverlay.remove();
                            _returnOverlay = null;
                            lenis.start();
                        }
                    });
                }
            });
        });
    });
}

// =========================================================================
// 10. ARROW CLICK HANDLERS
// =========================================================================
upArrow.addEventListener('click', () => {
    if (!st) return;
    const ci = Math.max(Math.round(st.progress * (totalCards - 1)) - 1, 0);
    lenis.scrollTo(st.start + (ci / (totalCards - 1)) * (st.end - st.start), { duration: 1.2 });
});
downArrow.addEventListener('click', () => {
    if (!st) return;
    const ci = Math.min(Math.round(st.progress * (totalCards - 1)) + 1, totalCards - 1);
    lenis.scrollTo(st.start + (ci / (totalCards - 1)) * (st.end - st.start), { duration: 1.2 });
});

// =========================================================================
// 11. CARD EXPAND → STORY PAGE TRANSITION
//     Scale-based zoom from card center with ALL glass effects intact.
//     Card moves to body, fixed at captured position, scales to viewport.
// =========================================================================
document.querySelectorAll('[data-action="read-story"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const card = btn.closest('.post');
        const storySlug = card.dataset.story;
        const cardIndex = card.dataset.cardIndex;
        if (!storySlug) return;

        // Capture visual position BEFORE anything changes
        const rect = card.getBoundingClientRect();

        // Freeze scrolling
        lenis.stop();
        gsap.killTweensOf(card);

        // Store which card was clicked (for reverse animation on return)
        sessionStorage.setItem('expanding-card-index', cardIndex);

        // Fade out text content first
        const textEls = card.querySelectorAll('.date, h2, .excerpt, .btn-standard');
        gsap.to(textEls, {
            opacity: 0,
            y: -15,
            duration: 0.3,
            stagger: 0.03,
            ease: "power2.in"
        });

        // After text fades, scale-expand the actual card
        gsap.delayedCall(0.25, () => {
            // Move card to body to escape stacking context
            document.body.appendChild(card);
            card.classList.add('is-expanding');
            card.style.cssText = '';

            // Fix at captured position
            card.style.top = rect.top + 'px';
            card.style.left = rect.left + 'px';
            card.style.width = rect.width + 'px';
            card.style.height = rect.height + 'px';

            // Re-enable SVG refraction so oily glass texture shows during expansion
            const glassBend = card.querySelector('.glass-bend');
            if (glassBend) {
                glassBend.style.filter = '';
                glassBend.style.clipPath = 'none';
                glassBend.style.webkitClipPath = 'none';
            }

            // Calculate scale to cover full viewport
            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            const vpCenterX = viewW / 2;
            const vpCenterY = viewH / 2;
            const scaleX = viewW / rect.width;
            const scaleY = viewH / rect.height;
            const finalScale = Math.max(scaleX, scaleY) * 1.05;
            const translateX = vpCenterX - cardCenterX;
            const translateY = vpCenterY - cardCenterY;

            // Prevent body scrollbars during expansion
            document.body.style.overflow = 'hidden';

            // Scale from center to fill viewport — all glass effects intact
            gsap.fromTo(card, {
                scale: 1,
                x: 0,
                y: 0,
            }, {
                scale: finalScale,
                x: translateX,
                y: translateY,
                duration: 0.9,
                ease: "power3.inOut",
                force3D: true,
                onComplete: () => {
                    window.location.href = `story.html?slug=${storySlug}`;
                }
            });
        });
    });
});


// =========================================================================
// 12. UNIFIED RAF LOOP
// =========================================================================
function mainLoop(time) {
    lenis.raf(time);
    tickMouse();
    requestAnimationFrame(mainLoop);
}
requestAnimationFrame(mainLoop);

// =========================================================================
// 13. RESIZE
// =========================================================================
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        viewH = window.innerHeight;
        viewW = window.innerWidth;
        ScrollTrigger.refresh();
    }, 250);
}, { passive: true });

