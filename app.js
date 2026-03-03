// =========================================================================
//  TACTILE BLOG — 4-Layer Liquid Glass Optics Engine
//  Architecture: SVG Refraction + CSS Claymorphism + GSAP Spring Physics
//  Performance: RAF-throttled updates, selective filtering, compositor-first
// =========================================================================

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
    root.style.setProperty('--mouse-x', mouseCurrent.x);
    root.style.setProperty('--mouse-y', mouseCurrent.y);
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
    }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        isScrolling = false;
        // Re-enable SVG filter on the active card after scroll settles
        if (lastActiveCardForFilter) {
            enableSVGFilter(lastActiveCardForFilter);
        }
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
//     - Smooth & slow glass expansion (no darkening)
//     - Text content fades out, only the glass expands
//     - After full coverage, navigate to story page
// =========================================================================
document.querySelectorAll('[data-action="read-story"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const card = btn.closest('.post');
        const storySlug = card.dataset.story;
        if (!storySlug) return;

        const rect = card.getBoundingClientRect();

        // Freeze scrolling
        lenis.stop();

        // Fade out text content first
        const textEls = card.querySelectorAll('.date, h2, .excerpt, .btn-standard');
        gsap.to(textEls, {
            opacity: 0,
            y: -20,
            duration: 0.3,
            stagger: 0.03,
            ease: "power2.in"
        });

        // After text fades, expand the glass card
        gsap.delayedCall(0.25, () => {
            // Kill scroll transforms and fix position
            gsap.killTweensOf(card);

            // Copy current visual position to fixed coordinates
            card.style.position = 'fixed';
            card.style.top = rect.top + 'px';
            card.style.left = rect.left + 'px';
            card.style.width = rect.width + 'px';
            card.style.height = rect.height + 'px';
            card.style.zIndex = '9999';
            card.style.margin = '0';
            card.style.transform = 'none';
            card.style.maxWidth = 'none';
            card.style.bottom = 'auto';
            card.style.right = 'auto';
            card.style.transition = 'none';
            card.style.contain = 'none';

            // Smooth GSAP expansion to fill viewport
            gsap.to(card, {
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                borderRadius: 0,
                duration: 0.8,
                ease: "power3.inOut",
                onComplete: () => {
                    // Brief pause then navigate
                    gsap.to(card, {
                        opacity: 0,
                        duration: 0.25,
                        onComplete: () => {
                            window.location.href = `story.html?slug=${storySlug}`;
                        }
                    });
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
