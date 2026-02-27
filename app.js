// Initialize Lucide Icons
lucide.createIcons();

// --- 1. Morphing Liquid Nav Component (GSAP) ---
const morphPill = document.getElementById('morphPill');
const menuIcon = document.querySelector('.icon-lucide[data-lucide="menu"]');
const closeIcon = document.querySelector('.icon-lucide.icon-close');
const navIconsContainer = document.getElementById('navIconsContainer');
const navIconsList = document.querySelectorAll('.nav-icon');

// Initialize GSAP state
gsap.set(navIconsContainer, { display: "none", opacity: 0, x: -20 });
gsap.set(navIconsList, { scale: 0.5, opacity: 0, x: -5 });

let isNavOpen = false;
let isAnimating = false;

function openNav() {
    if (isAnimating || isNavOpen) return;
    isAnimating = true;
    isNavOpen = true;

    // Morph the pill width smoothly
    gsap.to(morphPill, {
        width: 320,
        duration: 0.8,
        ease: "elastic.out(1, 0.7)",
        onComplete: () => isAnimating = false
    });

    // Swap Menu out, Close in
    gsap.to(menuIcon, { opacity: 0, display: "none", duration: 0.2 });
    gsap.to(closeIcon, { display: "block", opacity: 1, duration: 0.3, delay: 0.1 });

    // Reveal Nav Icons Container
    gsap.to(navIconsContainer, {
        display: "flex",
        opacity: 1,
        x: 0,
        duration: 0.4,
        delay: 0.1
    });

    // Stagger Nav Icons appearing with a slight spring
    gsap.to(navIconsList, {
        scale: 1,
        opacity: 1,
        x: 0,
        duration: 0.5,
        stagger: 0.08,
        delay: 0.15,
        ease: "back.out(1.5)"
    });
}

function closeNav() {
    if (isAnimating || !isNavOpen) return;
    isAnimating = true;
    isNavOpen = false;

    // Stagger Nav Icons out
    gsap.to(navIconsList, {
        scale: 0.5,
        opacity: 0,
        x: -5,
        duration: 0.3,
        stagger: 0.04,
        ease: "power2.in"
    });

    // Hide Container
    gsap.to(navIconsContainer, {
        opacity: 0,
        x: -20,
        duration: 0.3,
        delay: 0.1,
        onComplete: () => {
            gsap.set(navIconsContainer, { display: "none" });
        }
    });

    // Swap Close out, Menu in
    gsap.to(closeIcon, { opacity: 0, display: "none", duration: 0.2 });
    gsap.to(menuIcon, { display: "block", opacity: 1, duration: 0.3, delay: 0.2 });

    // Shrink liquid button back to circle
    gsap.to(morphPill, {
        width: 70, // Base dimension
        duration: 0.6,
        ease: "power3.inOut",
        delay: 0.15,
        onComplete: () => isAnimating = false
    });
}

// Event Triggers
morphPill.addEventListener('mouseenter', openNav);
morphPill.addEventListener('mouseleave', closeNav);


// --- 2. 3D Sticky Card Peel Animation ---
gsap.registerPlugin(ScrollTrigger);

// 1. Initialize Smooth Scrolling (Lenis)
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
});

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// 3. Animation Logic
const cards = document.querySelectorAll('.post');
const totalCards = cards.length;
const segmentSize = 1 / totalCards; // Divides the scroll progress equally among cards

// ==========================================
// CONTROLS FOR CARD PEEL OFF EFFECT
// ==========================================
const yOffset = 50;         // Pixels each subsequent card drops down initially
const scaleOffset = 0.08;   // Controls how much smaller background cards are (0.08 = 8% reduction per card)
const blurMultiplier = 10;   // Controls how much blur is applied to cards stacked behind (higher = blurrier)
// ==========================================

// Build the Liquid Glass Rotary Dial Pagination
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
    card.style.zIndex = totalCards - index; // Ensure top cards intercept clicks first
    const dot = document.createElement('div');
    dot.className = 'dial-dot';
    dialTrack.appendChild(dot);
});

document.querySelector('.sticky-card-section').appendChild(dialContainer);
const dots = document.querySelectorAll('.dial-dot');

// Function to render the precise physical stack given a virtual progress (0.0, 1.0, 2.0...)
function renderStack(virtualProgress) {
    let activeIndex = Math.floor(virtualProgress);
    activeIndex = Math.min(activeIndex, totalCards - 1);
    const segmentProgress = virtualProgress - activeIndex;

    cards.forEach((card, index) => {
        // STATE 1: PAST CARDS
        if (index < activeIndex) {
            gsap.set(card, {
                y: -window.innerHeight * 1.5,
                rotationX: 75,
                scale: 1,
                filter: "blur(0px)",
                opacity: 0
            });
        }
        // STATE 2: CURRENT ANIMATING CARD
        else if (index === activeIndex) {
            const currentY = gsap.utils.interpolate(0, -window.innerHeight * 1.5, segmentProgress);
            const currentRotX = gsap.utils.interpolate(0, 75, segmentProgress);
            const currentOpacity = gsap.utils.interpolate(1, 0, segmentProgress);

            gsap.set(card, {
                y: currentY,
                rotationX: currentRotX,
                scale: 1,
                filter: "blur(0px)",
                opacity: currentOpacity
            });
        }
        // STATE 3: FUTURE CARDS
        else {
            const behindIndex = index - activeIndex;
            const offsetProgress = behindIndex - segmentProgress;

            const targetY = offsetProgress * yOffset;
            const targetScale = 1 - (offsetProgress * scaleOffset);
            const blurAmount = gsap.utils.clamp(0, 20, offsetProgress * blurMultiplier);

            gsap.set(card, {
                y: targetY,
                rotationX: 0,
                scale: targetScale,
                filter: `blur(${blurAmount}px)`,
                opacity: 1
            });
        }
    });

    // Update the pagination dial dynamically
    gsap.set(dialTrack, { y: -virtualProgress * 30 }); // 30 is the combined dot spacing

    dots.forEach((dot, index) => {
        const dist = Math.abs(index - virtualProgress);
        let scale = 0, opacity = 0;

        if (dist < 0.1) {
            scale = 1.3;
            opacity = 1;
        } else if (dist <= 1.5) {
            // adjacent dots
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

// --- Scroll Driven Scrub Snapping (Buttery Smooth) ---
let st = ScrollTrigger.create({
    trigger: '.sticky-card-section',
    start: 'top top',
    // Reduced length so scrolling feels effortless and requires a low threshold
    end: () => `+=${window.innerHeight * 0.4 * totalCards}`,
    pin: true,
    scrub: 0.5, // Buttery smooth continuous scrub
    snap: {
        snapTo: 1 / (totalCards - 1), // Strict layout alignment on rest
        duration: { min: 0.2, max: 0.5 },
        delay: 0.05,
        ease: "power1.inOut"
    },
    onUpdate: (self) => {
        const progress = self.progress * (totalCards - 1);
        renderStack(progress);
    }
});

// Arrow Click Handlers
upArrow.addEventListener('click', () => {
    if (!st) return;
    let currentProgress = st.progress * (totalCards - 1);
    let targetIndex = Math.max(Math.round(currentProgress) - 1, 0);
    // Calculate precise scoll position for the target index
    let targetScroll = st.start + (targetIndex / (totalCards - 1)) * (st.end - st.start);
    lenis.scrollTo(targetScroll, { duration: 1.2, lock: false });
});

downArrow.addEventListener('click', () => {
    if (!st) return;
    let currentProgress = st.progress * (totalCards - 1);
    let targetIndex = Math.min(Math.round(currentProgress) + 1, totalCards - 1);
    // Calculate precise scoll position for the target index
    let targetScroll = st.start + (targetIndex / (totalCards - 1)) * (st.end - st.start);
    lenis.scrollTo(targetScroll, { duration: 1.2, lock: false });
});
