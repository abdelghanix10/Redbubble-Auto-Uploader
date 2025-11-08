/**
 * Background Service Worker for Redbubble Auto Uploader
 * Maintains side panel state and handles communication
 */

// Store side panel state in memory
let panelState = {
  images: [],
  currentIndex: 0,
  isUploading: false,
  csvData: null,
};

// Store current upload task
let currentUploadTask = null;

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request.action, sender);

  switch (request.action) {
    case "savePanelState":
      // Save the panel state
      panelState = request.state;
      console.log("Panel state saved:", panelState);
      sendResponse({ success: true });
      break;

    case "getPanelState":
      // Return the current panel state
      console.log("Returning panel state:", panelState);
      sendResponse({ success: true, state: panelState });
      break;

    case "updateImageStatus":
      // Update status of a specific image
      const { index, status } = request;
      if (panelState.images[index]) {
        panelState.images[index].status = status;
        console.log(`Updated image ${index} status to: ${status}`);
      }
      sendResponse({ success: true });
      break;

    case "clearState":
      // Clear the state
      panelState = {
        images: [],
        currentIndex: 0,
        isUploading: false,
        csvData: null,
      };
      currentUploadTask = null;
      console.log("Panel state cleared");
      sendResponse({ success: true });
      break;

    case "startUploadTask":
      // Store upload task from side panel
      currentUploadTask = {
        imageFile: request.imageFile,
        formData: request.formData,
        currentIndex: request.currentIndex,
        totalImages: request.totalImages,
        timestamp: Date.now(),
      };
      console.log("Upload task stored:", currentUploadTask);

      // Forward to content script
      forwardToContentScript(sender, request, sendResponse);
      return true; // Will respond asynchronously

    case "uploadComplete":
      // Upload completed, forward to side panel
      console.log("Upload complete, notifying side panel");
      forwardToSidePanel(request);
      sendResponse({ success: true });
      break;

    case "updateStatus":
      // Forward status updates to side panel
      forwardToSidePanel(request);
      sendResponse({ success: true });
      break;

    case "getUploadTask":
      // Content script requesting current task (after page reload)
      console.log("Content script requesting upload task:", currentUploadTask);
      sendResponse({ success: true, task: currentUploadTask });
      break;

    case "clearUploadTask":
      // Clear the current upload task
      currentUploadTask = null;
      console.log("Upload task cleared");
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }

  return true; // Keep message channel open for async response
});

// Forward message to content script
async function forwardToContentScript(sender, request, sendResponse) {
  try {
    const tabs = await chrome.tabs.query({
      url: "https://www.redbubble.com/*",
    });
    if (tabs.length > 0) {
      // Send message without waiting for response (fire-and-forget)
      // This prevents errors when content script gets unloaded during page redirect
      chrome.tabs
        .sendMessage(tabs[0].id, {
          action: "startUpload",
          imageFile: request.imageFile,
          formData: request.formData,
          currentIndex: request.currentIndex,
          totalImages: request.totalImages,
        })
        .catch((error) => {
          // Content script might be unloading, this is expected
          console.log(
            "Message sent to content script (may be reloading):",
            error.message
          );
        });

      // Respond immediately to side panel
      sendResponse({
        success: true,
        message: "Upload task sent to content script",
      });
    } else {
      sendResponse({ success: false, error: "No Redbubble tab found" });
    }
  } catch (error) {
    console.error("Failed to forward to content script:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Forward message to side panel
async function forwardToSidePanel(request) {
  try {
    // Send to runtime (side panel is listening)
    await chrome.runtime.sendMessage(request);
  } catch (error) {
    console.error("Failed to forward to side panel:", error);
  }
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log("Redbubble Auto Uploader background service worker loaded");
