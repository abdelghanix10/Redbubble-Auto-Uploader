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

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request.action);

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
      console.log("Panel state cleared");
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }

  return true; // Keep message channel open for async response
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log("Redbubble Auto Uploader background service worker loaded");
