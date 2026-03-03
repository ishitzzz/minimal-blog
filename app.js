// =========================================================================
//  TACTILE BLOG — 4-Layer Liquid Glass Optics Engine
//  Architecture: SVG Refraction + CSS Claymorphism + GSAP Spring Physics
//  No WebGL — pure CSS/SVG for maximum compatibility
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

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// =========================================================================
//  2. CARD STACK CONFIGURATION
// =========================================================================
const cards = document.querySelectorAll('.post');
const totalCards = cards.length;

// ==========================================
// CONTROLS FOR CARD PEEL OFF EFFECT
// ==========================================
const yOffset = 50;         // Pixels each subsequent card drops down initially
const scaleOffset = 0.08;   // Controls how much smaller background cards are
const blurMultiplier = 10;  // Controls blur on stacked cards
// ==========================================

// =========================================================================
//  3. DYNAMIC LIGHTING ENGINE — Mouse-tracked 3D bevels
//     Updates CSS custom properties for the claymorphic volume layer
// =========================================================================
const root = document.documentElement;

function updateLighting(clientX, clientY) {
    // Map cursor position relative to the viewport center to 0-100 range
    const x = (clientX / window.innerWidth) * 100;
    const y = (clientY / window.innerHeight) * 100;
    root.style.setProperty('--mouse-x', x);
    root.style.setProperty('--mouse-y', y);
}

window.addEventListener('mousemove', (e) => {
    updateLighting(e.clientX, e.clientY);
});

// =========================================================================
//  4. SVG REFRACTION SYNC — Wire CSS variables to SVG filter attributes
//     This bridges the CSS control panel to the SVG feTurbulence/feDisplacementMap
// =========================================================================
const svgDisp = document.getElementById('svg-disp');
const svgTurb = document.getElementById('svg-turb');

function syncSVGFilter() {
    const styles = getComputedStyle(root);
    const warp = parseFloat(styles.getPropertyValue('--refraction-warp')) || 150;
    const oiliness = parseFloat(styles.getPropertyValue('--liquid-oiliness')) || 30;

    if (svgDisp) svgDisp.setAttribute('scale', warp);
    if (svgTurb) {
        const base = oiliness * 0.0001;
        svgTurb.setAttribute('baseFrequency', `${base} ${base * 2.33}`);
    }
}

// Sync on load
syncSVGFilter();

// =========================================================================
//  5. INTERNAL SUSPENSION: "Oil Float" Parallax
//     Text elements drift independently with different mass/friction
// =========================================================================
function updateOilFloat(card, segmentProgress, isPeelingAway) {
    const innerElements = card.querySelectorAll('.date, h2, .excerpt, .btn-standard');

    innerElements.forEach((el, i) => {
        const mass = parseFloat(getComputedStyle(el).getPropertyValue('--float-mass')) || 0.2;

        if (isPeelingAway) {
            const lag = segmentProgress * mass * 40;
            const drift = segmentProgress * mass * -8;
            gsap.set(el, {
                y: -lag,
                x: drift,
                opacity: gsap.utils.interpolate(1, 0, segmentProgress * (1 + mass)),
                force3D: true
            });
        } else {
            gsap.set(el, {
                y: 0,
                x: 0,
                opacity: 1,
                force3D: true
            });
        }
    });
}

// =========================================================================
//  6. LIQUID GLASS ROTARY DIAL PAGINATION
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
//  7. RENDER STACK: Core animation loop with Spring Physics
// =========================================================================
const bgTexture = document.querySelector('.bg-texture');

function renderStack(virtualProgress) {
    let activeIndex = Math.floor(virtualProgress);
    activeIndex = Math.min(activeIndex, totalCards - 1);
    const segmentProgress = virtualProgress - activeIndex;

    cards.forEach((card, index) => {
        // ---- STATE 1: PAST CARDS (peeled away) ----
        if (index < activeIndex) {
            gsap.set(card, {
                y: -window.innerHeight * 1.5,
                rotationX: 75,
                scale: 1,
                opacity: 0,
                force3D: true
            });
            card.style.filter = '';
            updateOilFloat(card, 1, true);
        }
        // ---- STATE 2: CURRENT ANIMATING CARD (Elastic Blooming Physics) ----
        else if (index === activeIndex) {
            const easedProgress = gsap.parseEase("power2.in")(segmentProgress);

            const currentY = gsap.utils.interpolate(0, -window.innerHeight * 1.5, easedProgress);
            const currentRotX = gsap.utils.interpolate(0, 75, easedProgress);

            const opacityEase = gsap.parseEase("power3.out")(segmentProgress);
            const currentOpacity = gsap.utils.interpolate(1, 0, opacityEase);

            gsap.set(card, {
                y: currentY,
                rotationX: currentRotX,
                scale: 1,
                opacity: currentOpacity,
                force3D: true
            });

            card.style.filter = '';

            // Oil Float: internal elements drift with mass-based lag
            updateOilFloat(card, segmentProgress, true);
        }
        // ---- STATE 3: FUTURE CARDS (Stacked, with selective blur) ----
        else {
            const behindIndex = index - activeIndex;
            const offsetProgress = behindIndex - segmentProgress;

            const targetY = offsetProgress * yOffset;
            const targetScale = 1 - (offsetProgress * scaleOffset);

            gsap.set(card, {
                y: targetY,
                rotationX: 0,
                scale: targetScale,
                opacity: 1,
                force3D: true
            });

            // Selective Filtering: blur stacked cards behind the active one
            if (behindIndex <= 2) {
                const blurAmount = gsap.utils.clamp(0, 20, offsetProgress * blurMultiplier);
                card.style.filter = `blur(${blurAmount}px)`;
            } else {
                card.style.filter = `blur(20px)`;
            }

            updateOilFloat(card, 0, false);
        }
    });

    // Update the pagination dial
    gsap.set(dialTrack, { y: -virtualProgress * 30 });

    dots.forEach((dot, index) => {
        const dist = Math.abs(index - virtualProgress);
        let scale = 0, opacity = 0;

        if (dist < 0.1) {
            scale = 1.3;
            opacity = 1;
        } else if (dist <= 1.5) {
            scale = gsap.utils.mapRange(0.1, 1.5, 1.0, 0.4, dist);
            opacity = gsap.utils.mapRange(0.1, 1.5, 0.7, 0.1, dist);
        } else {
            scale = 0;
            opacity = 0;
        }

        gsap.to(dot, { scale: scale, opacity: opacity, duration: 0.2, overwrite: "auto" });
    });
}

// Initial full render
renderStack(0);

// =========================================================================
//  8. SCROLL-DRIVEN ANIMATION (Buttery Smooth Scrub + Snap)
// =========================================================================
let st = ScrollTrigger.create({
    trigger: '.sticky-card-section',
    start: 'top top',
    end: () => `+=${window.innerHeight * 0.4 * totalCards}`,
    pin: true,
    scrub: 0.5,
    snap: {
        snapTo: 1 / (totalCards - 1),
        duration: { min: 0.3, max: 0.7 },
        delay: 0.05,
        ease: "elastic.out(1, 0.4)"
    },
    onUpdate: (self) => {
        const progress = self.progress * (totalCards - 1);
        renderStack(progress);
    }
});

// =========================================================================
//  9. ARROW CLICK HANDLERS
// =========================================================================
upArrow.addEventListener('click', () => {
    if (!st) return;
    let currentProgress = st.progress * (totalCards - 1);
    let targetIndex = Math.max(Math.round(currentProgress) - 1, 0);
    let targetScroll = st.start + (targetIndex / (totalCards - 1)) * (st.end - st.start);
    lenis.scrollTo(targetScroll, { duration: 1.2, lock: false });
});

downArrow.addEventListener('click', () => {
    if (!st) return;
    let currentProgress = st.progress * (totalCards - 1);
    let targetIndex = Math.min(Math.round(currentProgress) + 1, totalCards - 1);
    let targetScroll = st.start + (targetIndex / (totalCards - 1)) * (st.end - st.start);
    lenis.scrollTo(targetScroll, { duration: 1.2, lock: false });
});

// =========================================================================
// 10. CARD EXPAND → STORY PAGE TRANSITION
//     Clicking "Read Story" morphs the card to full-screen, then navigates
// =========================================================================
const expandOverlay = document.getElementById('expand-overlay');

document.querySelectorAll('[data-action="read-story"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const card = btn.closest('.post');
        const storySlug = card.dataset.story;
        if (!storySlug) return;

        // Capture card's current position
        const rect = card.getBoundingClientRect();

        // Disable scrolling during transition
        lenis.stop();

        // Remove GSAP inline transforms and fix position
        gsap.killTweensOf(card);
        card.style.cssText = '';
        card.style.position = 'fixed';
        card.style.top = rect.top + 'px';
        card.style.left = rect.left + 'px';
        card.style.width = rect.width + 'px';
        card.style.height = rect.height + 'px';
        card.style.zIndex = '9999';
        card.style.margin = '0';
        card.style.transform = 'none';
        card.style.borderRadius = 'var(--glass-radius)';

        // Show backdrop overlay
        expandOverlay.classList.add('active');

        // Force reflow
        card.offsetHeight;

        // Add transition class and trigger full-screen morph
        card.classList.add('is-expanding');

        requestAnimationFrame(() => {
            card.classList.add('full-screen');

            // After the morph animation completes, navigate to story page
            card.addEventListener('transitionend', function onEnd(evt) {
                if (evt.propertyName !== 'width') return;
                card.removeEventListener('transitionend', onEnd);

                // Navigate with a slight fade
                document.body.style.opacity = '0';
                document.body.style.transition = 'opacity 0.2s ease';

                setTimeout(() => {
                    window.location.href = `story.html?slug=${storySlug}`;
                }, 200);
            });
        });
    });
});

// =========================================================================
// 11. RESIZE HANDLER
// =========================================================================
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        ScrollTrigger.refresh();
    }, 250);
});
