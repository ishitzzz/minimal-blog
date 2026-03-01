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
// EXPANDING LIQUID GLASS ARTICLE TRANSITION
// ==========================================
const articleOverlay = document.querySelector('.article-overlay');
const articleGlassBg = document.querySelector('.article-glass-bg');
const articleContent = document.querySelector('.article-content');
const closeArticleBtn = document.querySelector('.close-article');
const articleTitleContainer = document.querySelector('.article-title');
const articleDateContainer = document.querySelector('.article-date');

// Function to handle the expansion
function expandArticle(postElement) {
    // 1. Get the visual properties of the card we clicked
    const rect = postElement.getBoundingClientRect();
    const titleText = postElement.querySelector('h2').innerText;
    const dateText = postElement.querySelector('.date').innerText;

    // 2. Set the content
    articleTitleContainer.innerText = titleText;
    articleDateContainer.innerText = dateText;

    // 3. Pause background scrolling
    lenis.stop();
    document.body.style.overflow = 'hidden';

    // 4. Reset states for the overlay container and content
    gsap.set(articleOverlay, { opacity: 1, visibility: 'visible' });
    gsap.set(articleContent, { display: 'block', opacity: 0, y: 50 });

    // 5. Morph the glass background from the exact size and position of the card
    gsap.set(articleGlassBg, {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: "20px"
    });

    // 6. Animate to full viewport with fluid motion and enhanced refraction logic
    const tl = gsap.timeline();

    // Morph background
    tl.to(articleGlassBg, {
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        borderRadius: "0px",
        duration: 0.8,
        ease: "power3.inOut"
    });

    // Fade and slide in the newspaper content
    tl.to(articleContent, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power2.out"
    }, "-=0.3"); // Overlap slightly to make it feel connected
}

// Function to handle the close transition
function closeArticle() {
    const tl = gsap.timeline({
        onComplete: () => {
            gsap.set(articleOverlay, { opacity: 0, visibility: 'hidden' });
            gsap.set(articleContent, { display: 'none' });
            lenis.start();
            document.body.style.overflow = '';
        }
    });

    tl.to(articleContent, {
        opacity: 0,
        y: 30,
        duration: 0.4,
        ease: "power2.in"
    });

    // Fade the glass out gently
    tl.to(articleGlassBg, {
        opacity: 0,
        duration: 0.5,
        ease: "power2.inOut"
    }, "-=0.2");

    // Reset glass opacity for next time
    tl.set(articleGlassBg, { opacity: 1 });
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

closeArticleBtn.addEventListener('click', closeArticle);
