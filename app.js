// Initialize Lucide Icons
lucide.createIcons();




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

// ==========================================
// EXPANDING LIQUID GLASS PORTAL TRANSITION
// ==========================================
const bloomPortal = document.querySelector('.bloom-portal');
const bgTexture = document.querySelector('.bg-texture');

// Function to handle the expansion to entirely new page
function expandArticle(postElement) {
    if (!bloomPortal) return;

    // 1. Get the visual properties of the actual card we clicked
    const rect = postElement.getBoundingClientRect();

    // 2. Pause background scrolling to lock viewport
    lenis.stop();
    document.body.style.overflow = 'hidden';

    // 3. Reset states for the invisible portal and prep the morph clone
    gsap.set(bloomPortal, {
        display: 'block',
        opacity: 1,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: "40px" // Same as card
    });

    // We can fade out the actual card stack quickly so we only see the growing portal
    gsap.to('.sticky-card-section', {
        opacity: 0,
        duration: 0.3,
        ease: "power2.inOut"
    });

    // 4. Create the core visual physics of the bloom
    const tl = gsap.timeline({
        onComplete: () => {
            // Once the screen is filled with glass, seamlessly jump to the dedicated story URL!
            window.location.href = 'story.html';
        }
    });

    // A. "The Surge" and Fluid Dilation
    // Elastic out or Expo out feels organic and weighty
    tl.to(bloomPortal, {
        top: "-10vh", // Stretch slightly out of bounds to guarantee complete fill
        left: "-10vw",
        width: "120vw",
        height: "120vh",
        borderRadius: "0px",
        duration: 1.2,
        ease: "expo.out" // Surges outward fast, decelerates to soft landing
    });

    // B. Background Recess 
    // Wait, let's play this at the exact same time as the portal stretch (starts at 0 in the timeline)
    tl.to(bgTexture, {
        scale: 0.9,
        filter: "brightness(0.6) blur(20px)",
        duration: 1.2,
        ease: "expo.out"
    }, 0);
}

// Attach event listeners
document.querySelectorAll('.post .btn-standard').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        const postElement = e.target.closest('.post');
        if (postElement) {
            expandArticle(postElement);
        }
    });
});
