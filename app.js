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

    // Create full-screen SOLID overlay covering everything from frame 1.
    // Uses solid color instead of backdrop-filter for instant render (~0ms).
    // Backdrop-filter costs ~15ms on first paint and causes the white flash.
    _returnOverlay = document.createElement('div');
    _returnOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(230, 228, 222, 0.95);
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
//  3. DYNAMIC LIGHTING — Lerp-smoothed, RAF-throttled, PER-CARD
//     Mouse position is accumulated and applied once per frame via lerp.
//     PERF FIX: Properties are set on individual cards (active + next)
//     instead of :root, preventing a full DOM style cascade on every frame.
// =========================================================================
const root = document.documentElement;
let mouseTarget = { x: 50, y: 50 };
let mouseCurrent = { x: 50, y: 50 };
const MOUSE_LERP = 0.1;
let currentLitCards = [];  // Track which cards have per-card lighting applied
let currentActiveIdx = 0;  // Track active card index for per-card updates

window.addEventListener('mousemove', (e) => {
    mouseTarget.x = (e.clientX / viewW) * 100;
    mouseTarget.y = (e.clientY / viewH) * 100;
}, { passive: true });

// Set lighting properties on a specific element (card or root)
function applyLighting(el, lightX, lightY, shadowX, shadowY, mx, my) {
    el.style.setProperty('--light-x', `${lightX}px`);
    el.style.setProperty('--light-y', `${lightY}px`);
    el.style.setProperty('--shadow-x', `${shadowX}px`);
    el.style.setProperty('--shadow-y', `${shadowY}px`);
    el.style.setProperty('--drop-x', `${shadowX * 2}px`);
    el.style.setProperty('--drop-y', `${20 + shadowY * 2}px`);
    el.style.setProperty('--mouse-x-pct', `${mx}%`);
    el.style.setProperty('--mouse-y-pct', `${my}%`);
}

// Clear per-card lighting (revert to :root defaults)
function clearLighting(el) {
    el.style.removeProperty('--light-x');
    el.style.removeProperty('--light-y');
    el.style.removeProperty('--shadow-x');
    el.style.removeProperty('--shadow-y');
    el.style.removeProperty('--drop-x');
    el.style.removeProperty('--drop-y');
    el.style.removeProperty('--mouse-x-pct');
    el.style.removeProperty('--mouse-y-pct');
}

function tickMouse() {
    const dx = mouseTarget.x - mouseCurrent.x;
    const dy = mouseTarget.y - mouseCurrent.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;

    mouseCurrent.x += dx * MOUSE_LERP;
    mouseCurrent.y += dy * MOUSE_LERP;

    // CROSS-BROWSER OPTIMIZATION: Pre-compute light/shadow offsets in JS.
    const lightX = ((50 - mouseCurrent.x) / 50) * 8;
    const lightY = ((50 - mouseCurrent.y) / 50) * 8;
    const shadowX = ((mouseCurrent.x - 50) / 50) * 8;
    const shadowY = ((mouseCurrent.y - 50) / 50) * 8;
    const mx = mouseCurrent.x;
    const my = mouseCurrent.y;

    // PER-CARD LIGHTING: Only update the active card and the next card.
    // This avoids setting on :root which cascades to ALL elements in the DOM.
    const newLitCards = [];
    const active = cards[currentActiveIdx];
    const next = cards[currentActiveIdx + 1];
    if (active) { applyLighting(active, lightX, lightY, shadowX, shadowY, mx, my); newLitCards.push(active); }
    if (next) { applyLighting(next, lightX, lightY, shadowX, shadowY, mx, my); newLitCards.push(next); }

    // Clear lighting from cards that are no longer active/next
    for (const old of currentLitCards) {
        if (!newLitCards.includes(old)) clearLighting(old);
    }
    currentLitCards = newLitCards;
}

// =========================================================================
//  4. CANVAS2D PRE-RENDERED TURBULENCE
//     Instead of feTurbulence computing fractal noise on the CPU every frame,
//     we generate the noise texture ONCE on page load using Canvas2D,
//     then inject it as a static feImage into the SVG filter.
//     The feDisplacementMap still runs, but it warps from a CACHED TEXTURE
//     instead of regenerating noise. This eliminates the #1 bottleneck.
// =========================================================================
const svgDisp = document.getElementById('svg-disp');
const svgTurb = document.getElementById('svg-turb');

// Simple 2D Simplex-inspired noise (fast, no dependencies)
function generateNoiseTexture(width, height, freqX, freqY) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Pseudo-random hash function (deterministic, no Math.random)
    function hash(x, y) {
        let h = x * 374761393 + y * 668265263;
        h = (h ^ (h >> 13)) * 1274126177;
        h = h ^ (h >> 16);
        return h;
    }

    // Smooth noise with bilinear interpolation
    function smoothNoise(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        // Smoothstep for organic look
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);

        const n00 = (hash(ix, iy) & 0xFFFF) / 0xFFFF;
        const n10 = (hash(ix + 1, iy) & 0xFFFF) / 0xFFFF;
        const n01 = (hash(ix, iy + 1) & 0xFFFF) / 0xFFFF;
        const n11 = (hash(ix + 1, iy + 1) & 0xFFFF) / 0xFFFF;

        const nx0 = n00 + sx * (n10 - n00);
        const nx1 = n01 + sx * (n11 - n01);
        return nx0 + sy * (nx1 - nx0);
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Multi-octave fractal noise (matches feTurbulence fractalNoise)
            let noiseR = 0, noiseG = 0;
            let amp = 1, freq = 1;
            for (let oct = 0; oct < 2; oct++) {
                noiseR += smoothNoise(x * freqX * freq, y * freqY * freq) * amp;
                noiseG += smoothNoise(x * freqX * freq + 100, y * freqY * freq + 100) * amp;
                amp *= 0.5;
                freq *= 2;
            }
            noiseR = noiseR / 1.5;  // Normalize
            noiseG = noiseG / 1.5;

            const idx = (y * width + x) * 4;
            data[idx] = Math.floor(noiseR * 255);  // R channel (used by xChannelSelector)
            data[idx + 1] = Math.floor(noiseG * 255);  // G channel (used by yChannelSelector)
            data[idx + 2] = 128;                       // B (unused)
            data[idx + 3] = 255;                       // A (fully opaque)
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

(function initPreRenderedTurbulence() {
    const styles = getComputedStyle(root);
    const warp = parseFloat(styles.getPropertyValue('--refraction-warp')) || 150;
    const oiliness = parseFloat(styles.getPropertyValue('--liquid-oiliness')) || 30;

    // Set displacement scale
    if (svgDisp) svgDisp.setAttribute('scale', warp);

    // Generate the noise texture (512x512 is enough for the displacement map)
    const freqBase = oiliness * 0.0001;
    const noiseCanvas = generateNoiseTexture(512, 512, freqBase * 512, freqBase * 2.33 * 512);
    const dataURL = noiseCanvas.toDataURL('image/png');

    // Replace the live feTurbulence with a static feImage in the SVG filter
    const filterEl = document.querySelector('#glass-blur');
    if (filterEl && svgTurb) {
        // Create feImage element (SVG namespace required)
        const feImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
        feImage.setAttribute('href', dataURL);
        feImage.setAttribute('result', 'turbulence');
        feImage.setAttribute('x', '0%');
        feImage.setAttribute('y', '0%');
        feImage.setAttribute('width', '100%');
        feImage.setAttribute('height', '100%');
        feImage.setAttribute('preserveAspectRatio', 'none');

        // Replace feTurbulence with feImage
        filterEl.replaceChild(feImage, svgTurb);
    }
})();

// =========================================================================
//  5. SVG FILTER MANAGEMENT (Simplified — no longer catastrophically expensive)
//     With pre-rendered turbulence, the SVG filter is now cheap enough to keep
//     on the active card at all times. We still disable it on non-active cards
//     and during scroll for maximum performance headroom.
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
    // Apply to new active card
    if (card) {
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
        disableAllSVGFilters();
        cards.forEach(c => c.classList.add('is-scrolling'));
        if (filterReenableRAF) cancelAnimationFrame(filterReenableRAF);
    }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        isScrolling = false;
        cards.forEach(c => c.classList.remove('is-scrolling'));
        filterReenableRAF = requestAnimationFrame(() => {
            if (lastActiveCardForFilter) {
                enableSVGFilter(lastActiveCardForFilter);
            }
        });
    }, 150);  // Reduced from 200ms — pre-rendered filter re-enables faster
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

    // Update tracked active index for per-card lighting
    currentActiveIdx = activeIndex;

    cards.forEach((card, index) => {
        if (index < activeIndex) {
            // PAST: off-screen — dormant glass
            gsap.set(card, {
                y: -viewH * 1.5, rotationX: 75, scale: 1, opacity: 0, force3D: true
            });
            if (lastBlur.get(index) !== 0) {
                card.style.filter = ''; lastBlur.set(index, 0);
            }
            card.classList.add('glass-dormant');
            updateOilFloat(card, 1, true);
        }
        else if (index === activeIndex) {
            // ACTIVE: peeling off — full glass, not dormant
            card.classList.remove('glass-dormant');
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

            // DORMANCY: Cards 3+ positions behind get glass layers hidden
            // Top 2 stacked cards keep glass for visual depth, rest are dormant
            if (behind > 2) {
                card.classList.add('glass-dormant');
            } else {
                card.classList.remove('glass-dormant');
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

    // Scroll to the correct card position instantly (solid overlay covers everything)
    const targetProgress = targetIdx / (totalCards - 1);
    const scrollPos = st.start + targetProgress * (st.end - st.start);
    window.scrollTo(0, scrollPos);
    lenis.stop();

    // Force the card stack to render at this card
    renderStack(targetIdx);

    // Wait 1 frame for layout (solid overlay is faster than backdrop-filter)
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

        // Shrink from viewport to card position (faster with solid overlay)
        gsap.to(_returnOverlay, {
            scale: 1,
            x: 0,
            y: 0,
            duration: 0.7,
            ease: 'power3.inOut',
            force3D: true,
            onComplete: () => {
                gsap.to(_returnOverlay, {
                    opacity: 0,
                    duration: 0.25,
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
// 11. CARD EXPAND → STORY PAGE TRANSITION — PHANTOM OVERLAY
//     Instead of reparenting the real card (which causes layout thrash),
//     we use a pre-existing lightweight phantom overlay at body level.
//     The phantom has NO backdrop-filter or SVG filter — just a solid
//     semi-transparent background. Glass is imperceptible during fast motion.
// =========================================================================
const expansionPhantom = document.getElementById('expansion-phantom');
const stickySection = document.querySelector('.sticky-card-section');
const siteHeader = document.querySelector('.site-header');

document.querySelectorAll('[data-action="read-story"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const card = btn.closest('.post');
        const storySlug = card.dataset.story;
        const cardIndex = card.dataset.cardIndex;
        if (!storySlug || !expansionPhantom) return;

        // Capture card position BEFORE anything changes
        const rect = card.getBoundingClientRect();

        // Freeze scrolling
        lenis.stop();

        // CHROME FIX: Switch header from position:fixed to position:absolute.
        // backdrop-filter can't sample sibling position:fixed elements in Chrome.
        // Making the header absolute lets the phantom's glass refract the "Tactile." text.
        if (siteHeader) {
            siteHeader.style.position = 'absolute';
            siteHeader.style.top = (window.scrollY + parseFloat(getComputedStyle(siteHeader).top)) + 'px';
        }

        // Store which card was clicked (for reverse animation on return)
        sessionStorage.setItem('expanding-card-index', cardIndex);

        // Fade out text content on the real card
        const textEls = card.querySelectorAll('.date, h2, .excerpt, .btn-standard');
        gsap.to(textEls, {
            opacity: 0,
            y: -15,
            duration: 0.25,
            stagger: 0.02,
            ease: "power2.in"
        });

        // After text fades, scale the PHANTOM overlay (not the real card)
        gsap.delayedCall(0.2, () => {
            // Position phantom exactly at the card's rect
            expansionPhantom.style.top = rect.top + 'px';
            expansionPhantom.style.left = rect.left + 'px';
            expansionPhantom.style.width = rect.width + 'px';
            expansionPhantom.style.height = rect.height + 'px';
            expansionPhantom.style.transformOrigin = 'center center';

            // Show phantom, hide real card stack (Content Visibility Isolation)
            expansionPhantom.classList.add('is-active');
            stickySection.classList.add('section-hidden');

            // Prevent body scrollbars
            document.body.style.overflow = 'hidden';

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

            // Scale phantom from card-size to fill viewport
            // No backdrop-filter, no SVG filter = pure GPU compositor animation
            gsap.fromTo(expansionPhantom, {
                scale: 1,
                x: 0,
                y: 0,
            }, {
                scale: finalScale,
                x: translateX,
                y: translateY,
                duration: 0.7,
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

