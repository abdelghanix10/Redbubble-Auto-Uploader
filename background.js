/**
 * Background Service Worker for Redbubble Auto Uploader
 * Maintains upload queue data across page reloads
 */

// Store upload queue in memory (persists across page reloads)
let uploadQueue = {
  images: [],
  currentIndex: 0,
  isUploading: false,
  csvData: null,
};

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request.action);

  switch (request.action) {
    case "saveQueue":
      // Save the upload queue
      uploadQueue = request.data;
      console.log("Queue saved:", uploadQueue);
      sendResponse({ success: true });
      break;

    case "getQueue":
      // Return the current queue
      console.log("Returning queue:", uploadQueue);
      sendResponse({ success: true, data: uploadQueue });
      break;

    case "updateImageStatus":
      // Update status of a specific image
      const { index, status } = request;
      if (uploadQueue.images[index]) {
        uploadQueue.images[index].status = status;
        console.log(`Updated image ${index} status to: ${status}`);
      }
      sendResponse({ success: true });
      break;

    case "clearQueue":
      // Clear the queue
      uploadQueue = {
        images: [],
        currentIndex: 0,
        isUploading: false,
        csvData: null,
      };
      console.log("Queue cleared");
      sendResponse({ success: true });
      break;

    case "getCurrentImage":
      // Get the current image to upload
      const currentImage = uploadQueue.images[uploadQueue.currentIndex];
      sendResponse({ success: true, data: currentImage });
      break;

    case "incrementIndex":
      // Move to next image
      uploadQueue.currentIndex++;
      console.log("Index incremented to:", uploadQueue.currentIndex);
      sendResponse({ success: true, index: uploadQueue.currentIndex });
      break;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }

  return true; // Keep message channel open for async response
});

console.log("Redbubble Auto Uploader background service worker loaded");
