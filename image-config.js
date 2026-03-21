/**
 * STORY IMAGES CONFIGURATION
 * 
 * Here you can define all the images that appear within your stories locally!
 * 
 * HOW TO USE:
 * 1. Inside your story text in story.html, just write a placeholder tag like [IMAGE_1] 
 *    on an empty line between your paragraphs.
 * 2. In this file below, map that tag to your exact photo properties. 
 *    The engine will automatically style, format, and load everything securely!
 */

window.StoryImagesConfig = {

  // Images for the story page: "The Art of Digital Paper"
  "art-of-digital-paper": {
    "[IMAGE_1]": {
      src: "picture1.jpeg", // Path to your local photo
      alt: "Me underneath the big tree",

      // Manual layout and styling controls for this specific image:
      size: "55%",             // Controls width: use percentages ("65%") or explicit pixels ("500px")
      radius: "12px",           // Border roundness: "0px" for sharp polaroid corners, "12px" for rounded
      textureIntensity: 2.0   // Paper grain blend: 0.0 means completely clear, 1.0 means heavy dark paper texture
    }
    // You can add "[IMAGE_2]": { ... }, etc below!
  },

  // Example for another story
  "liquid-interfaces": {
    "[IMAGE_1]": {
      src: "some-other-photo.jpeg",
      alt: "Liquid example",
      size: "80%",
      radius: "16px",
      textureIntensity: 0.5
    }
  }

};
